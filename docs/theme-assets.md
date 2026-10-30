# Tema təsvirləri

Mikasa təsvirləri daxili Imagegen aləti ilə yaradılıb. WebP və kursor variantları ölçü və fayl formatına uyğunlaşdırılıb, orijinal təsvirlər saxlanılıb.

Fayllar:
- `AzTuLms.Api/wwwroot/themes/mikasa-wallpaper.webp` — fon
- `AzTuLms.Api/wwwroot/themes/mikasa-sprite.webp` — şəffaf animasiya personajı
- `AzTuLms.Api/wwwroot/themes/mikasa-cursor.png` — kursor

## Fon üçün prompt

Use case: stylized-concept. Asset: wide 1536x1024 anime wallpaper for a personal university dashboard theme named Mikasa. Depict adult Mikasa Ackerman, recognizable short black hair, grey eyes, signature deep red scarf, olive jacket, standing calmly at the FAR RIGHT quarter of the image, waist-up portrait. Cinematic hand-painted anime illustration, overcast sky and distant stone city silhouettes, charcoal black, warm ivory, burgundy palette. Left two-thirds almost empty soft dark charcoal atmosphere so UI can sit on top. Subtle dramatic light, refined and restrained, no text, no watermark, no interface. Character face clearly visible and elegant.

## Personaj üçün prompt

Use case: stylized-concept. Asset: single transparent-background full-body chibi Mikasa Ackerman sprite for a playful website cursor companion. Recognizable short black bob hair, grey eyes, deep red scarf, tan cropped military jacket, cream trousers, dark brown boots. Adult character rendered as cute chibi, smiling slightly, arms out to sides and knees slightly bent as if doing a tiny dance. Centered, entire body visible with ample padding, crisp clean anime sticker illustration, no text, no ground, no shadows outside body, no props, actual transparent background.

Tema bu cihazda hər hesabın `aztu.profile.<id>` seçimlərində saxlanır. Rəng redaktoru yalnız altı simvolluq HEX rəngləri qəbul edir. Kursor və rəqs incə göstəricisi olan cihazlarda işləyir; toxunma ekranlarında kursor göstərilmir. Hərəkəti azalt sistem seçimi effektləri söndürür. Universitet məlumatları, fayllar və autentifikasiya axını dəyişdirilmir.

Bu dəyişikliklər lokal baxış üçündür. Yayım ayrıca edilir.

## Eren Yeager

Daxili Imagegen ilə yaradılan fayllar:
- `AzTuLms.Api/wwwroot/themes/eren-wallpaper.webp` — fon
- `AzTuLms.Api/wwwroot/themes/eren-sprite.webp` — şəffaf rəqs personajı
- `AzTuLms.Api/wwwroot/themes/eren-cursor.png` — kursor

Fon üçün prompt:

Use case: stylized-concept. Asset: wide 1536x1024 anime wallpaper for an Eren Yeager personal dashboard theme, matching a refined cinematic dark Mikasa wallpaper. Depict ADULT Eren Yeager, long dark brown hair half tied back, piercing teal green eyes, dark open coat over a modest light shirt, calm serious expression, waist-up at the FAR RIGHT quarter of the composition. Atmospheric distant stone city and windswept clouds, smoky charcoal and forest-green palette with restrained warm light. Left two-thirds dark soft negative space for dashboard content. Hand-painted anime illustration with detailed face and painterly atmosphere, elegant and restrained. No text, no watermarks, no interface, no other characters.

Personaj üçün prompt:

Use case: stylized-concept. Asset: single transparent-background full-body chibi ADULT Eren Yeager sprite for a playful website cursor companion, matching cute clean anime sticker art. Recognizable long dark brown hair tied in a small bun with side strands, teal green eyes, dark charcoal coat over an ivory shirt, dark trousers and boots. Slight smile, arms out to sides and knees bent like doing a tiny dance. Centered full body entirely visible with padding. Crisp clean detailed anime illustration, genuinely transparent background, no scenery, no ground, no outer shadows, no text, no watermark. Single character only.

Hər iki personaj eyni söndürülə bilən effekt mexanizmindən istifadə edir. Tema dəyişərkən əvvəlki personaj silinir, yeni temanın fonu və kursoru tətbiq olunur.

## Madara Uchiha

Daxili Imagegen ilə yaradılan fayllar:
- `AzTuLms.Api/wwwroot/themes/madara-wallpaper.webp` — fon
- `AzTuLms.Api/wwwroot/themes/madara-sprite.webp` — şəffaf rəqs personajı
- `AzTuLms.Api/wwwroot/themes/madara-cursor.png` — kursor

Fon üçün prompt:

Use case: stylized-concept. Asset: wide 1536x1024 anime wallpaper for a Madara Uchiha personal dashboard theme matching refined cinematic dark Mikasa and Eren wallpapers. Depict adult Madara Uchiha, recognizable long spiky black hair, subtle red Sharingan eyes, layered dark crimson samurai-style armor over black clothing, calm commanding expression, waist-up at FAR RIGHT quarter of composition. Distant misty mountains and stone valley, smoky charcoal and deep crimson palette with restrained silver moonlight. Left two-thirds dark soft negative space for dashboard content. Detailed elegant hand-painted anime illustration, no violence, no weapons, no text, no watermark, no interface, no other characters.

Personaj üçün prompt:

Use case: stylized-concept. Asset: single transparent-background full-body chibi ADULT Madara Uchiha sprite for a playful website cursor companion, matching cute clean anime sticker art. Recognizable long spiky black hair, red Sharingan eyes, dark crimson layered samurai armor over black clothes and dark shinobi sandals. Slight confident smile, arms out to sides and knees bent doing a tiny dance. Centered full body entirely visible with ample padding. Crisp clean anime sticker illustration, genuinely transparent background, no scenery, no ground, no outer shadows, no weapons, no text, no watermark, one character only.
