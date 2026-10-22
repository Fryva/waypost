export function planBatches(jobs, concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) {
    throw new RangeError('concurrency must be an integer between 1 and 64');
  }
  if (!Array.isArray(jobs)) {
    throw new TypeError('jobs must be an array');
  }

  const nodes = new Map();

  // Validate every record before checking graph relationships.
  for (const job of jobs) {
    if (job === null || typeof job !== 'object' || Array.isArray(job)) {
      throw new TypeError('Each job must be an object');
    }
    const id = job.id;
    if (typeof id !== 'string' || id.length === 0 || nodes.has(id)) {
      throw new TypeError('Job ids must be unique nonempty strings');
    }

    const suppliedDependencies = job.dependsOn;
    const dependencies = suppliedDependencies === undefined ? [] : suppliedDependencies;
    if (!Array.isArray(dependencies)) {
      throw new TypeError('dependsOn must be an array');
    }
    const dependencyIds = [];
    const seen = new Set();
    for (const dependencyId of dependencies) {
      if (typeof dependencyId !== 'string' || dependencyId.length === 0 || seen.has(dependencyId)) {
        throw new TypeError('Dependencies must be distinct nonempty strings');
      }
      seen.add(dependencyId);
      dependencyIds.push(dependencyId);
    }

    const suppliedPriority = job.priority;
    const priority = suppliedPriority === undefined ? 0 : suppliedPriority;
    if (!Number.isSafeInteger(priority)) {
      throw new TypeError('priority must be a safe integer');
    }

    nodes.set(id, {
      id,
      priority,
      dependencyIds,
      dependents: [],
      pending: dependencyIds.length,
      completed: false
    });
  }

  for (const node of nodes.values()) {
    for (const dependencyId of node.dependencyIds) {
      if (dependencyId === node.id || !nodes.has(dependencyId)) {
        const error = new Error('Graph contains an unknown dependency or self-dependency');
        error.code = 'INVALID_GRAPH';
        throw error;
      }
      nodes.get(dependencyId).dependents.push(node);
    }
  }

  const compareIds = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  const batches = [];
  let unfinished = nodes.size;

  while (unfinished > 0) {
    const ready = [];
    for (const node of nodes.values()) {
      if (!node.completed && node.pending === 0) {
        ready.push(node);
      }
    }

    if (ready.length === 0) {
      const error = new Error('Graph contains a cycle');
      error.code = 'CYCLE';
      error.remaining = Array.from(nodes.values())
        .filter(node => !node.completed)
        .map(node => node.id)
        .sort(compareIds);
      throw error;
    }

    ready.sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority > right.priority ? -1 : 1;
      }
      return compareIds(left.id, right.id);
    });

    // Freeze the selection before releasing any dependencies for the next round.
    const selected = ready.slice(0, concurrency);
    batches.push(selected.map(node => node.id));
    for (const node of selected) {
      node.completed = true;
      unfinished -= 1;
    }
    for (const node of selected) {
      for (const dependent of node.dependents) {
        dependent.pending -= 1;
      }
    }
  }

  return batches;
}
