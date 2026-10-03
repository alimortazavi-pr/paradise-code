interface Project { name: string; files: number }
const project: Project = { name: 'Paradise Code', files: 3 };
export function describe(value: Project): string {
  return `${value.name}: ${value.files}`;
}
console.log(describe(project));
