import assert from 'node:assert/strict';
import {COLORS,PRESETS,palette,themeId,contrast} from '../AzTuLms.Api/wwwroot/theme-model.mjs';
assert.deepEqual(palette(null),COLORS);
assert.equal(palette({ink:'#AABBCC'}).ink,'#aabbcc');
assert.equal(palette({bg:'url(https://example.com/)',ink:'#123',line:'red;position:fixed',extra:'#ffffff'}).bg,COLORS.bg);
assert.equal(palette({ink:'#123'}).ink,COLORS.ink);
assert.equal(palette({extra:'#ffffff'}).extra,undefined);
for(const value of [null,undefined,'__proto__','constructor','x" onload="bad'])assert.equal(themeId(value),'light');
for(const id of [...Object.keys(PRESETS),'custom'])assert.equal(themeId(id),id);
assert.equal(contrast('#ffffff','#000000'),21);
assert.equal(contrast('#123456','#123456'),1);
for(const [id,p] of Object.entries(PRESETS)){
 assert.ok(contrast(p.ink,p.surface)>=4.5,id+' text');
 assert.ok(contrast(p.muted,p.surface)>=4.5,id+' secondary text');
 assert.ok(contrast(p.buttonText,p.accent)>=4.5,id+' button');
}
console.log('Theme palette validation, safe colors and preset contrast passed.');
