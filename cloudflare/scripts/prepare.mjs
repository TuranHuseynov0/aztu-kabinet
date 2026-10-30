import {mkdir,copyFile,writeFile,readdir} from 'node:fs/promises';
const source=new URL('../../AzTuLms.Api/wwwroot/',import.meta.url);
const dest=new URL('../public/',import.meta.url);
await mkdir(dest,{recursive:true});
for(const entry of await readdir(source,{withFileTypes:true})){
 if(entry.isFile()&&/\.(?:html|mjs|js|css|svg|ico|woff2?)$/.test(entry.name))await copyFile(new URL(entry.name,source),new URL(entry.name,dest));
}
// Only this dedicated image directory is public; academic data stays private.
const themeSource=new URL('themes/',source),themeDest=new URL('themes/',dest);
await mkdir(themeDest,{recursive:true});
for(const entry of await readdir(themeSource,{withFileTypes:true})){
 if(entry.isFile()&&/\.(?:webp|png|svg)$/.test(entry.name))await copyFile(new URL(entry.name,themeSource),new URL(entry.name,themeDest));
}
await writeFile(new URL('_headers',dest),`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Cache-Control: no-cache
  Strict-Transport-Security: max-age=31536000
`);
console.log('Public UI assets prepared. Timetable catalog and session data stay private.');
