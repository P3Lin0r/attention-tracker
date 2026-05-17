declare module "*.worker.ts" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}

declare module "*.worker?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}