export function planBatches(jobs, concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) {
    throw new RangeError('concurrency must be an integer between 1 and 64');
  }
  if (!Array.isArray(jobs)) {
    throw new TypeError('jobs must be an array');
  }

  const nodes = new Map();

  // Validate and copy every record before checking graph relationships.
  for (const job of jobs) {
    if (job === null || typeof job !== 'object' || Array.isArray(job)) {
      throw new TypeError('Each job must be a record');
    }

    const id = job.id;
    const rawDependencies = job.dependsOn;
    const rawPriority = job.priority;
    const dependencies = rawDependencies === undefined ? [] : rawDependencies;
    const priority = rawPriority === undefined ? 0 : rawPriority;

    if (typeof id !== 'string' || id.length === 0 || nodes.has(id)) {
      throw new TypeError('Job ids must be distinct nonempty strings');
    }
    if (!Array.isArray(dependencies)) {
      throw new TypeError('dependsOn must be an array');
    }
    if (!Number.isSafeInteger(priority)) {
      throw new TypeError('priority must be a safe integer');
    }

    const seen = new Set();
    const copiedDependencies = [];
    for (const dependency of dependencies) {
      if (typeof dependency !== 'string' || dependency.length === 0 || seen.has(dependency)) {
        throw new TypeError('Dependencies must be distinct nonempty strings');
      }
      seen.add(dependency);
      copiedDependencies.push(dependency);
    }

    nodes.set(id, {
      id,
      priority,
      dependencies: copiedDependencies,
      remaining: copiedDependencies.length,
      dependents: []
    });
  }

  for (const node of nodes.values()) {
    for (const dependency of node.dependencies) {
      if (dependency === node.id || !nodes.has(dependency)) {
        const error = new Error('Unknown dependency or self-dependency');
        error.code = 'INVALID_GRAPH';
        throw error;
      }
    }
  }

  for (const node of nodes.values()) {
    for (const dependency of node.dependencies) {
      nodes.get(dependency).dependents.push(node);
    }
  }

  const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const compareReady = (a, b) => {
    if (a.priority !== b.priority) {
      return a.priority > b.priority ? -1 : 1;
    }
    return compareIds(a.id, b.id);
  };

  const unfinished = new Set(nodes.keys());
  const ready = [];
  for (const node of nodes.values()) {
    if (node.remaining === 0) ready.push(node);
  }

  const batches = [];
  while (unfinished.size > 0) {
    if (ready.length === 0) {
      const error = new Error('Dependency cycle prevents completion');
      error.code = 'CYCLE';
      error.remaining = Array.from(unfinished).sort(compareIds);
      throw error;
    }

    ready.sort(compareReady);
    const selected = ready.splice(0, concurrency);
    batches.push(selected.map(node => node.id));

    // Select the entire batch before unlocking any dependent jobs.
    for (const node of selected) {
      unfinished.delete(node.id);
      for (const dependent of node.dependents) {
        dependent.remaining -= 1;
        if (dependent.remaining === 0) ready.push(dependent);
      }
    }
  }

  return batches;
}
