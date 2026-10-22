export function filterJobs(list, kind, q, sort) {
    const ql = q.trim().toLowerCase();
    const r = list.filter(j => (kind === 'all' || (kind === 'legal') === j.legal) && (!ql || j.name.toLowerCase().includes(ql)));
    const byName = (a, b) => a.name.localeCompare(b.name, 'uk');
    return r.sort((a, b) => sort === 'profit' ? b.profit - a.profit || byName(a, b)
        : sort === 'level' ? a.level - b.level || byName(a, b) : byName(a, b));
}
