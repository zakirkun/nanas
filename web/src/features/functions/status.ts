import type { FunctionListItem } from './queries';

export function computeFunctionStatus(it: FunctionListItem): 'active' | 'draft' | 'failed' {
  if (it.last_deployment_status === 'failed') return 'failed';
  if (it.last_deployment_status === 'active') return 'active';
  if (it.current_version) return 'draft';
  return 'draft';
}
