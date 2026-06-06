type Listener = () => void;

const taskDataChangeListeners = new Set<Listener>();

export function onTaskDataChanged(listener: Listener): () => void {
  taskDataChangeListeners.add(listener);
  return () => {
    taskDataChangeListeners.delete(listener);
  };
}

export function notifyTaskDataChanged(): void {
  taskDataChangeListeners.forEach((listener) => listener());
}
