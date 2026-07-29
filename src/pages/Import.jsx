import { useState, useMemo, useRef } from 'react'
import {
  Sparkle, Check, Cloud, AlertTriangle, PartyPopper, Zap,
} from 'lucide-react'
import { authHeader } from '../lib/supabase'
import { useAuth } from '../App'
import { useTransactions, autoCategorize } from '../hooks/useTransactions'
import { useIsPro } from '../hooks/useIsPro'
import {
  parseSpreadsheetFile, detectColumns, detectDateFormat, normalizeRow,
  validateMapping, buildDedupeKey,
} from '../lib/importParsing'
import { fmtCurrency as fmt } from '../lib/format'

const DATE_FORMAT_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'MDY', label: 'MM/DD/YYYY (US)' },
  { value: 'DMY', label: 'DD/MM/YYYY (UK/EU)' },
  { value: 'YMD', label: 'YYYY-MM-DD (ISO)' },
  { value: 'MONTH_NAME', label: 'Month name (e.g. Jan 5, 2024)' },
]

// category/subcategory/source for a CSV row: reuse the same keyword
// classifier used elsewhere in the app, but the row's `kind` comes from the
// bank data's actual sign — not from the keyword guess — so only accept the
// guess's category/source when it agrees with that kind.
function classifyForImport(description, kind) {
  const guess = autoCategorize(description)
  const agrees = guess.kind === kind
  if (kind === 'expense') {
    return {
      category: agrees ? guess.category : 'Wants',
      subcategory: agrees ? guess.subcategory : 'Other',
      source: null,
      autoCategorized: agrees && guess.auto,
    }
  }
  return {
    category: null,
    subcategory: null,
    source: agrees ? guess.source : 'Other',
    autoCategorized: agrees && guess.auto,
  }
}

export default function Import() {
  const { user } = useAuth()
  const { accounts, reload: reloadTxns } = useTransactions()
  const { isPro } = useIsPro(user.id)
  const [step, setStep] = useState(0)
  const fileInputRef = useRef(null)
  const [upgrading, setUpgrading] = useState(false)

  // ── File + raw grid ────────────────────────────────────────────────────────
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [fileError, setFileError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)

  // ── Column mapping ─────────────────────────────────────────────────────────
  const [detected, setDetected] = useState({ columns: {}, confidence: {} })
  const [mode, setMode] = useState('amount') // 'amount' | 'debitCredit'
  const [dateCol, setDateCol] = useState(0)
  const [descCol, setDescCol] = useState(1)
  const [amtCol, setAmtCol] = useState(2)
  const [debitCol, setDebitCol] = useState(null)
  const [creditCol, setCreditCol] = useState(null)
  const [dateFormatChoice, setDateFormatChoice] = useState('auto')
  const [invertSign, setInvertSign] = useState(false)
  const [accountId, setAccountId] = useState('')

  // ── Preview / import ───────────────────────────────────────────────────────
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [parsedRows, setParsedRows] = useState([])
  const [skippedCount, setSkippedCount] = useState(0)
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [doneCount, setDoneCount] = useState(0)
  const [aiCategorizing, setAiCategorizing] = useState(false)
  const [aiError, setAiError] = useState('')

  const columns = useMemo(() => {
    const c = { date: dateCol, description: descCol }
    if (mode === 'debitCredit') { c.debit = debitCol; c.credit = creditCol }
    else { c.amount = amtCol }
    return c
  }, [dateCol, descCol, mode, amtCol, debitCol, creditCol])

  const dateFormatResult = useMemo(() => {
    if (dateFormatChoice !== 'auto') return { format: dateFormatChoice, confidence: 1 }
    if (dateCol == null || !rows.length) return { format: null, confidence: 0 }
    return detectDateFormat(rows.map(r => r[dateCol]))
  }, [rows, dateCol, dateFormatChoice])

  const mapping = useMemo(() => validateMapping({ columns, dateFormatResult }), [columns, dateFormatResult])

  const duplicateCount = parsedRows.filter(r => r.isDuplicate).length
  const importableCount = parsedRows.filter(r => includeDuplicates || !r.isDuplicate).length

  const badgeFor = (field, currentValue) => {
    if (detected.columns[field] !== currentValue) return null
    const score = detected.confidence[field]
    if (score >= 100) return { label: 'detected', color: 'var(--positive)', bg: 'var(--positive-bg)', Icon: Check }
    if (score >= 60) return { label: '~ guessed', color: 'var(--warning)', bg: 'var(--warning-bg)', Icon: null }
    return null
  }

  // ── Step 0: upload ─────────────────────────────────────────────────────────
  const handleFile = async file => {
    if (!file) return
    setFileError('')
    setLoadingFile(true)
    try {
      const { headers: h, rows: r } = await parseSpreadsheetFile(file)
      const det = detectColumns(h)
      setHeaders(h)
      setRows(r)
      setDetected(det)

      const useDebitCredit = det.columns.debit != null && det.columns.credit != null
      setMode(useDebitCredit ? 'debitCredit' : 'amount')
      // Only fields that were actually detected get pre-selected — an
      // undetected field starts unselected so the "couldn't find a column"
      // validation error can actually fire, instead of silently guessing a
      // possibly-wrong column.
      setDateCol(det.columns.date ?? null)
      setDescCol(det.columns.description ?? null)
      if (useDebitCredit) {
        setDebitCol(det.columns.debit)
        setCreditCol(det.columns.credit)
      } else {
        setAmtCol(det.columns.amount ?? null)
        setDebitCol(det.columns.debit ?? Math.min(2, h.length - 1))
        setCreditCol(det.columns.credit ?? Math.min(3, h.length - 1))
      }
      setDateFormatChoice('auto')
      setInvertSign(false)
      setAccountId(accounts.length ? accounts[0].id : '')
      setStep(1)
    } catch (err) {
      setFileError(err.message || 'Could not read this file.')
    } finally {
      setLoadingFile(false)
    }
  }

  const handleDrop = e => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // ── Step 1 → 2: preview ────────────────────────────────────────────────────
  const handlePreview = async () => {
    setPreviewError('')
    setPreviewLoading(true)
    try {
      const normalized = rows.map(r => normalizeRow(r, columns, dateFormatResult.format, { invertSign }))
      const parseable = normalized.filter(n => n.date && n.amount != null && n.kind)
      const skipped = normalized.length - parseable.length

      if (!parseable.length) {
        setPreviewError('None of the rows could be parsed with this column mapping. Double-check the column and date format selections above.')
        setPreviewLoading(false)
        return
      }

      const dates = parseable.map(p => p.date).sort()
      let existing = []
      let q = supabase
        .from('account_transactions')
        .select('account_id,date,kind,amount,description')
        .eq('user_id', user.id)
        .gte('date', dates[0])
        .lte('date', dates[dates.length - 1])
      q = accountId ? q.eq('account_id', accountId) : q.is('account_id', null)
      const { data, error } = await q
      if (error) throw error
      existing = data || []

      const existingKeys = new Set(existing.map(e => buildDedupeKey({
        accountId: accountId || null, date: e.date, kind: e.kind, amount: e.amount, description: e.description,
      })))

      const seenInFile = new Set()
      const finalRows = parseable.map(p => {
        const key = buildDedupeKey({ accountId: accountId || null, date: p.date, kind: p.kind, amount: p.amount, description: p.description })
        const isDuplicate = existingKeys.has(key) || seenInFile.has(key)
        seenInFile.add(key)
        // Classified up front (not at import time) so the preview step can
        // show how many rows the keyword matcher missed and offer AI
        // categorization for them before they're actually inserted.
        return { ...p, _dedupeKey: key, isDuplicate, classified: classifyForImport(p.description, p.kind), aiCategorized: false }
      })

      setParsedRows(finalRows)
      setSkippedCount(skipped)
      setIncludeDuplicates(false)
      setStep(2)
    } catch (err) {
      setPreviewError(err.message || 'Something went wrong building the preview.')
    } finally {
      setPreviewLoading(false)
    }
  }

  // ── AI categorization for rows the keyword matcher missed ─────────────────
  // Free users keep the keyword-based classifyForImport() result as-is — the
  // "normal" categorization every row already gets during preview. AI
  // categorization (Claude Haiku 4.5, via /api/categorize) is Pro-only: the
  // backend already enforces this (isUserPro() check, see api/categorize.js),
  // this just avoids showing free users a button that would 403.
  //
  // Batches the not-yet-confidently-categorized rows (that will actually be
  // imported) through /api/categorize and merges the results back into
  // parsedRows. Import itself always reads from row.classified, so this
  // simply improves what gets imported — no change to the import flow is
  // needed on top of this.
  const AI_BATCH_SIZE = 50
  const needsAICount = parsedRows.filter(r => !r.classified.autoCategorized && (includeDuplicates || !r.isDuplicate)).length

  const handleUpgrade = async () => {
    setUpgrading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setUpgrading(false)
    } catch { setUpgrading(false) }
  }

  const handleAICategorize = async () => {
    const targets = parsedRows
      .map((r, i) => ({ ...r, _idx: i }))
      .filter(r => !r.classified.autoCategorized && (includeDuplicates || !r.isDuplicate))
    if (!targets.length) return

    setAiCategorizing(true)
    setAiError('')
    try {
      const updates = new Map() // row index (string) -> assignment
      for (let i = 0; i < targets.length; i += AI_BATCH_SIZE) {
        const batch = targets.slice(i, i + AI_BATCH_SIZE)
        const res = await fetch('/api/categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({
            userId: user.id,
            transactions: batch.map(r => ({ id: String(r._idx), description: r.description, kind: r.kind })),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error?.message || 'AI categorization failed')
        for (const a of data.assignments || []) updates.set(a.id, a)
      }

      setParsedRows(rows => rows.map((r, i) => {
        const a = updates.get(String(i))
        if (!a) return r
        const classified = r.kind === 'expense'
          ? { category: a.category || r.classified.category, subcategory: a.subcategory || r.classified.subcategory, source: null, autoCategorized: true }
          : { category: null, subcategory: null, source: a.source || r.classified.source, autoCategorized: true }
        return { ...r, classified, aiCategorized: true }
      }))
    } catch (err) {
      setAiError(err.message || 'AI categorization failed')
    } finally {
      setAiCategorizing(false)
    }
  }

  // ── Step 2 → 3: import ─────────────────────────────────────────────────────
  const handleImport = async () => {
    setImporting(true)
    setImportError('')
    const rowsToInsert = parsedRows.filter(r => includeDuplicates || !r.isDuplicate)
    const payload = rowsToInsert.map(r => ({
      user_id: user.id,
      account_id: accountId || null,
      description: r.description || 'Imported Transaction',
      amount: r.amount,
      kind: r.kind,
      category: r.classified.category,
      subcategory: r.classified.subcategory,
      source: r.classified.source,
      date: r.date,
      merchant: r.description || null,
      auto_categorized: r.classified.autoCategorized,
      source_type: 'csv_import',
      external_id: r._dedupeKey,
      status: 'posted',
    }))

    const BATCH = 50
    let inserted = 0
    let failed = false
    for (let i = 0; i < payload.length; i += BATCH) {
      const { data, error } = await supabase
        .from('account_transactions')
        .upsert(payload.slice(i, i + BATCH), { onConflict: 'user_id,external_id', ignoreDuplicates: true })
        .select('id')
      if (error) {
        setImportError(inserted > 0 ? `${inserted} transactions were imported before this error: ${error.message}` : error.message)
        failed = true
        break
      }
      inserted += data?.length || 0
    }
    setImporting(false)
    if (failed) return
    setDoneCount(inserted)
    setStep(3)
    reloadTxns()
  }

  const reset = () => {
    setStep(0); setRows([]); setHeaders([]); setFileError('')
    setParsedRows([]); setPreviewError(''); setImportError(''); setAiError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div>
      {step === 0 && (
        <div className="card p-6">
          <p className="font-bold text-primary mb-1">Step 1: Upload File</p>
          <label
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`block mt-4 border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${dragging ? '' : 'border-gray-300 dark:border-gray-600 hover:border-emerald-400'}`}
            style={dragging ? { borderColor: 'var(--positive)', background: 'var(--positive-bg)' } : undefined}
          >
            <div className="flex justify-center mb-3" style={{ color: dragging ? 'var(--positive)' : 'var(--text-muted)' }}><Cloud size={36} /></div>
            <p className="font-semibold" style={{ color: dragging ? 'var(--positive)' : 'var(--accent-text)' }}>{loadingFile ? 'Reading file…' : 'Upload a file'}</p>
            <p className="text-sm mt-1" style={{ color: dragging ? 'var(--positive)' : 'var(--text-muted)' }}>CSV, XLS, XLSX up to 10MB</p>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => handleFile(e.target.files[0])} className="hidden" />
          </label>
          {fileError && (
            <div className="mt-4 p-3 rounded-xl text-sm"
              style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative)', color: 'var(--negative)' }}>
              <AlertTriangle size={14} className="inline mr-1" /> {fileError}
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="card p-6">
          <p className="font-bold text-primary mb-1">Step 2: Map Columns</p>
          <p className="text-muted text-sm mb-4">{rows.length} rows detected. We've guessed the mapping below — check it before continuing.</p>

          <div className="mb-4">
            <label className="label">Amount format in this file</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button type="button" onClick={() => setMode('amount')}
                className="p-3 rounded-xl border text-sm font-semibold text-left"
                style={{ borderColor: mode === 'amount' ? 'var(--positive)' : 'var(--card-border)', background: mode === 'amount' ? 'var(--positive-bg)' : undefined, color: mode === 'amount' ? 'var(--positive)' : undefined }}>
                Single Amount column
                <span className="block text-xs font-normal text-muted mt-0.5">e.g. -12.34 for a purchase, 500.00 for a deposit</span>
              </button>
              <button type="button" onClick={() => setMode('debitCredit')}
                className="p-3 rounded-xl border text-sm font-semibold text-left"
                style={{ borderColor: mode === 'debitCredit' ? 'var(--positive)' : 'var(--card-border)', background: mode === 'debitCredit' ? 'var(--positive-bg)' : undefined, color: mode === 'debitCredit' ? 'var(--positive)' : undefined }}>
                Separate Debit / Credit columns
                <span className="block text-xs font-normal text-muted mt-0.5">both columns are positive numbers</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <ColumnSelect label="Date Column" value={dateCol} onChange={setDateCol} headers={headers} badge={badgeFor('date', dateCol)} />
            <ColumnSelect label="Description Column" value={descCol} onChange={setDescCol} headers={headers} badge={badgeFor('description', descCol)} />
          </div>

          {mode === 'amount' ? (
            <div className="mb-3">
              <ColumnSelect label="Amount Column" value={amtCol} onChange={setAmtCol} headers={headers} badge={badgeFor('amount', amtCol)} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <ColumnSelect label="Debit Column" value={debitCol} onChange={setDebitCol} headers={headers} badge={badgeFor('debit', debitCol)} />
              <ColumnSelect label="Credit Column" value={creditCol} onChange={setCreditCol} headers={headers} badge={badgeFor('credit', creditCol)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="label">Date Format</label>
              <select className="input-field" value={dateFormatChoice} onChange={e => setDateFormatChoice(e.target.value)}>
                {DATE_FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {dateFormatChoice === 'auto' && (
                <p className="text-xs text-muted mt-1">
                  {dateFormatResult.format
                    ? `Detected: ${DATE_FORMAT_OPTIONS.find(o => o.value === dateFormatResult.format)?.label}${dateFormatResult.confidence < 1 ? ' (low confidence — verify below)' : ''}`
                    : 'Could not detect a date format from this column'}
                </p>
              )}
            </div>
            <div>
              <label className="label">Import into Account</label>
              <select className="input-field" value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">No account (unassigned)</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-start gap-2 mb-4 p-3 rounded-xl border cursor-pointer" style={{ borderColor: 'var(--card-border)' }}>
            <input type="checkbox" checked={invertSign} onChange={e => setInvertSign(e.target.checked)} className="mt-1" />
            <span className="text-sm text-primary">
              Invert amounts (credit card statement)
              <span className="block text-xs text-muted font-normal mt-0.5">Check this if purchases show as positive and payments show as negative in this file.</span>
            </span>
          </label>

          {!mapping.valid && (
            <div className="mb-4 p-3 rounded-xl text-sm"
              style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative)', color: 'var(--negative)' }}>
              <p className="font-semibold mb-1 flex items-center gap-1.5"><AlertTriangle size={14} /> We can't confidently parse this file:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {mapping.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {previewError && (
            <div className="mb-4 p-3 rounded-xl text-sm"
              style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative)', color: 'var(--negative)' }}>
              <AlertTriangle size={14} className="inline mr-1" /> {previewError}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handlePreview} disabled={!mapping.valid || previewLoading} className="btn-primary disabled:opacity-50">
              {previewLoading ? 'Checking…' : 'Preview Import'}
            </button>
            <button onClick={reset} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card p-6">
          <p className="font-bold text-primary mb-1">Step 3: Preview</p>
          <p className="text-muted text-sm mb-4">
            Mapped: Date ← <b>{headers[dateCol]}</b> · Description ← <b>{headers[descCol]}</b> · Amount ←{' '}
            {mode === 'amount' ? <b>{headers[amtCol]}</b> : <b>{headers[debitCol]} / {headers[creditCol]}</b>}
            {' '}· Format: <b>{DATE_FORMAT_OPTIONS.find(o => o.value === dateFormatResult.format)?.label || '—'}</b>
          </p>

          <div className="mt-2 mb-4 space-y-2">
            {parsedRows.slice(0, 8).map((row, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: 'var(--card-border)' }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm text-primary truncate">{row.description || '—'}</p>
                    {row.isDuplicate && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                        Possible duplicate
                      </span>
                    )}
                    {row.aiCategorized && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
                        <Sparkle size={10} /> AI
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">{row.date}</p>
                </div>
                <span className="font-bold flex-shrink-0 ml-3" style={{ color: row.kind === 'income' ? 'var(--positive-strong)' : 'var(--negative-strong)' }}>
                  {row.kind === 'income' ? '+' : '-'}{fmt(row.amount)}
                </span>
              </div>
            ))}
          </div>

          <div className="text-sm text-muted mb-4 space-y-1">
            <p>{parsedRows.length} transactions parsed{skippedCount > 0 ? ` · ${skippedCount} rows skipped (couldn't be parsed)` : ''}</p>
            {duplicateCount > 0 && <p>{duplicateCount} look like duplicates of transactions you've already imported — these are skipped by default.</p>}
            <p className="font-semibold text-primary">{importableCount} will be imported.</p>
          </div>

          {needsAICount > 0 && (
            <div className="mb-4 p-3 rounded-xl flex items-center justify-between gap-3 flex-wrap"
              style={{ background: 'var(--info-bg)', border: '1px solid var(--info)' }}>
              <p className="text-xs flex items-center gap-1" style={{ color: 'var(--info)' }}>
                <Sparkle size={12} /> {needsAICount} transaction{needsAICount === 1 ? '' : 's'} couldn't be auto-categorized confidently
                {isPro ? '.' : ' — they\'ll import as Wants/Other (or Transfer In/Other).'}
              </p>
              {isPro ? (
                <button type="button" onClick={handleAICategorize} disabled={aiCategorizing}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0 disabled:opacity-50"
                  style={{ background: 'var(--info)', color: '#fff' }}>
                  {aiCategorizing ? 'Categorizing…' : `✨ AI Categorize ${needsAICount}`}
                </button>
              ) : (
                <button type="button" onClick={handleUpgrade} disabled={upgrading}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0 disabled:opacity-50 inline-flex items-center gap-1"
                  style={{ background: 'var(--info)', color: '#fff' }}>
                  <Zap size={11} /> {upgrading ? 'Redirecting…' : 'Upgrade to Pro to AI-categorize'}
                </button>
              )}
            </div>
          )}

          {aiError && (
            <div className="mb-4 p-3 rounded-xl text-sm"
              style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative)', color: 'var(--negative)' }}>
              <AlertTriangle size={14} className="inline mr-1" /> {aiError}
            </div>
          )}

          {duplicateCount > 0 && (
            <label className="flex items-center gap-2 mb-4 text-sm text-primary cursor-pointer">
              <input type="checkbox" checked={includeDuplicates} onChange={e => setIncludeDuplicates(e.target.checked)} />
              Import the {duplicateCount} possible duplicates anyway
            </label>
          )}

          {importError && (
            <div className="mb-4 p-3 rounded-xl text-sm"
              style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative)', color: 'var(--negative)' }}>
              <AlertTriangle size={14} className="inline mr-1" /> Import failed: {importError}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleImport} disabled={importing || importableCount === 0} className="btn-primary disabled:opacity-50">
              {importing ? 'Importing...' : <><Check size={16} /> Import {importableCount} Transaction{importableCount === 1 ? '' : 's'}</>}
            </button>
            <button onClick={() => setStep(1)} className="btn-secondary">Back</button>
            <button onClick={reset} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card p-12 text-center">
          <div className="flex justify-center mb-4 text-primary"><PartyPopper size={44} /></div>
          <p className="text-2xl font-bold text-primary mb-2">{doneCount} transactions imported!</p>
          <p className="text-muted text-sm mb-6">
            They've been added to your account transactions.
            {skippedCount > 0 && ` ${skippedCount} rows couldn't be parsed and were skipped.`}
          </p>
          <button onClick={reset} className="btn-primary">Import Another File</button>
        </div>
      )}
    </div>
  )
}

function ColumnSelect({ label, value, onChange, headers, badge }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="label mb-0">{label}</label>
        {badge && <span className="text-xs font-semibold inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded" style={{ background: badge.bg, color: badge.color }}>{badge.Icon && <badge.Icon size={11} />} {badge.label}</span>}
      </div>
      <select className="input-field" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : +e.target.value)}>
        <option value="">— Select column —</option>
        {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </div>
  )
}
