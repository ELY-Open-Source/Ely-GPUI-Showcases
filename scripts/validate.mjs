import { read } from "./catalog.mjs";

const { apps, featured } = read(process.cwd());
console.log(`catalog: ${apps.length} apps, ${featured.length} featured`);
