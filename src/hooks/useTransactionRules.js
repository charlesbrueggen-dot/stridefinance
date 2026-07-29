// src/hooks/useTransactionRules.js
// CRUD for the user's custom transaction rules (transaction_rules table).
// Applied by autoCategorize() in useTransactions.js (checked before the
// built-in keyword rules) and managed from the "Rules" tab on Accounts.jsx.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export const MATCH_FIELDS = [
  { value: 'description', label: 'Description contains' },
  { value: 'merchant', label: 'Merchant contains' },
]

export function useTransactionRules(userId) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('transaction_rules')
      .select('*')
      .eq('user_id', userId)
      .order('priority', { ascending: false })
    setRules(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const addRule = async payload => {
    const { error } = await supabase.from('transaction_rules').insert({ ...payload, user_id: userId })
    if (!error) await load()
    return { error }
  }

  const deleteRule = async id => {
    const { error } = await supabase.from('transaction_rules').delete().eq('id', id).eq('user_id', userId)
    if (!error) await load()
    return { error }
  }

  return { rules, loading, reload: load, addRule, deleteRule }
}
