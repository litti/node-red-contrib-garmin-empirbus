export const getResultError = (result: any): string | null =>
    result?.hasFailed ? (result.errors || []).join(', ') || 'EmpirBus command failed.' : null
