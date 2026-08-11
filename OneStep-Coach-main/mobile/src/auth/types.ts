export type AuthUiState = 'LOADING' | 'SIGNED_OUT' | 'SIGNED_IN' | 'ERROR'

export type LinkedMember = {
  id: string
  name: string
  roleHint: string | null
}

export type MemberBootstrapResult =
  | { status: 'LINKED'; member: LinkedMember; authUserId: string }
  | { status: 'UNLINKED'; authUserId: string }
  | { status: 'ERROR'; message: string }
