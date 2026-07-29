// src/hooks/useHousehold.js
// Household membership + invite codes (households / household_members /
// household_invite_codes tables, RLS documented in schema.sql). A user with
// no household gets `householdUserIds: [userId]` — every page can always use
// that array uniformly instead of branching on "do I have a household."
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export function useHousehold(userId) {
  const [household, setHousehold] = useState(null)
  const [members, setMembers] = useState([])
  const [inviteCodes, setInviteCodes] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    const { data: membership } = await supabase
      .from('household_members').select('household_id').eq('user_id', userId).maybeSingle()

    if (!membership) {
      setHousehold(null); setMembers([]); setInviteCodes([]); setLoading(false)
      return
    }

    const [{ data: hh }, { data: mem }, { data: codes }] = await Promise.all([
      supabase.from('households').select('*').eq('id', membership.household_id).maybeSingle(),
      supabase.from('household_members').select('*').eq('household_id', membership.household_id),
      supabase.from('household_invite_codes').select('*').eq('household_id', membership.household_id)
        .gt('expires_at', new Date().toISOString()),
    ])
    setHousehold(hh || null)
    setMembers(mem || [])
    setInviteCodes(codes || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const householdUserIds = useMemo(
    () => members.length > 0 ? members.map(m => m.user_id) : (userId ? [userId] : []),
    [members, userId]
  )

  const createHousehold = async (name = 'My Household') => {
    const { data: hh, error } = await supabase.from('households').insert({ name, created_by: userId }).select().single()
    if (error) return { error }
    const { error: memberError } = await supabase.from('household_members').insert({ household_id: hh.id, user_id: userId })
    if (memberError) return { error: memberError }
    await load()
    return { data: hh }
  }

  const generateInviteCode = async () => {
    if (!household) return { error: new Error('No household to invite to') }
    const code = generateCode()
    const expires_at = new Date(Date.now() + INVITE_TTL_MS).toISOString()
    const { error } = await supabase.from('household_invite_codes')
      .insert({ household_id: household.id, code, created_by: userId, expires_at })
    if (!error) await load()
    return { code, error }
  }

  const revokeInviteCode = async id => {
    await supabase.from('household_invite_codes').delete().eq('id', id)
    await load()
  }

  const redeemInviteCode = async code => {
    const { data, error } = await supabase.rpc('redeem_household_invite', { p_code: code.trim().toUpperCase() })
    if (!error) await load()
    return { data, error }
  }

  const leaveHousehold = async () => {
    await supabase.from('household_members').delete().eq('user_id', userId)
    await load()
  }

  return {
    household, members, inviteCodes, householdUserIds, loading,
    createHousehold, generateInviteCode, revokeInviteCode, redeemInviteCode, leaveHousehold, reload: load,
  }
}
