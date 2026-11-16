# Tổng hợp skill làm UI: tasteskill 2.5.1

> Bản tóm tắt từ `.agents/skills/design-taste-frontend/SKILL.md` để dùng như checklist khi thiết kế, build, review hoặc sửa UI.
>
> Mục tiêu: làm website giống sản phẩm của một công ty tốt thật sự — nói rõ bán gì, cho ai, cho thấy sản phẩm/dịch vụ thật trên từng màn hình, và trông được làm riêng cho khách hàng này. Chuẩn tham chiếu: figma.com và x.ai. Không template, không “art piece”, không cảm giác AI làm.

---

## 1. Chín nguyên tắc gốc

1. **Không caption/mô tả dưới ảnh, render hay visual.** Credit giấy phép gom vào một dòng ở footer.
2. **Visual nào cũng phải render thật**, không để khung trống, ở 1440, 1024, 768 và 390px.
3. **Mỗi màn hình một section.** Hero đứng một mình ở màn đầu. Mỗi section cao đúng 1–2 màn ở 1440×900; không để tiêu đề section sau ló vào. Ngoại lệ: section `photo-chapters` dạng live có thể dài 3–4 màn.
4. **Mép trái và mép phải của nội dung phải bằng nhau.**
5. **Micro-interaction khi hover:** card có link nhấc 2px; ảnh zoom 1.02–1.03 trong khung; button nhấc khi hover và lún khi click; underline vẽ ra; card loop chạy 2.5–4s, lặp và restart khi hover. Không tilt, không carousel, không timed tab. Hero vào một lần khi tải (`data-enter`). Mỗi trang có một “dealt moment”, trang dài có hai.
6. **Nhiều ảnh thật và ảnh tốt hơn** ở nơi phù hợp; nền đẹp hơn; hero, layout và font tốt hơn.
7. **Icon thật, đủ màu** (icon thật của sản phẩm đã biết, không tự vẽ). Card có thể có diagram nhỏ: hub với nhánh; một input → processor → ba lane song song; pulse chạy trên đường.
8. **Scene/moment lớn là một phần của skill.** Mọi trang đều có moment, nhưng shader/scene chỉ dùng cho chủ đề kỹ thuật: tech, AI, developer tool, gaming, fintech, hardware. Cafe, tiệm bánh, guesthouse, shop nhỏ thì dùng ảnh.
9. **Địa chỉ:** chỉ số nhà/đường và quận/khu; không số nhà, postcode, tọa độ; không mã số thuế/đăng ký; không số điện thoại đúng format thật; contact dùng domain `.example`.

---

## 2. Phân loại doanh nghiệp quyết định mọi thứ

Ghi loại ngay dòng đầu của plan và khai báo trên trang bằng `<html data-type>`, `<meta name="page-type">`, `<meta name="site-kind">`; nếu là địa điểm thêm `<meta name="page-kind" content="place">`.

| Brief | page type | site-kind | kind |
|---|---|---|---|
| App, SaaS, AI, developer tool, fintech/banking, studio bán software của mình | software | software | software |
| Game, studio ra mắt game | software | gaming | gaming |
| Hardware/thiết bị tech: drone, robot arm, bàn phím | product | tech | tech |
| Sản phẩm vật lý/brand khác: ghế, xe đạp, cà phê bán online | product | other | product |
| Người được thuê: clinic, law firm, agency, creative studio, trade | service | other | service |
| Người đi đến: cafe, bar, bakery, restaurant, guesthouse, khách sạn nhỏ, shop, florist, bike shop, gym, studio địa phương | place | other | place |

- Nơi vừa sản xuất vừa mở cửa/đón khách (xưởng gốm, tiệm bánh có web shop) là **place**; web shop trở thành section hàng hóa. Chỉ là **product** khi không có gì xảy ra ở cửa.
- **Tech** = site-kind software, gaming, tech. **Other** = mọi thứ còn lại.
- Effect, scene, loop, count, CSS ground, trang tối, hero tối: **chỉ tech**.
- Trang **other**: ảnh, màu phẳng, typography, icon thật, hero entrance, dealt moment (photo/type-led), hover layer. Không effect/ground/loop/fragment/diagram/tab.

---

## 3. Page plan theo loại

### Place — cafe, bakery, guesthouse, shop
- Ảnh dẫn dắt: **12–20 ảnh** cho trang đầy đủ, **8–12 ảnh** cho bản compact, dưới 8 ảnh thì dùng trang ngắn 3 màn.
- Không có ảnh khách hàng: dùng stand-in có giấy phép + live search, ghi rõ trong report.
- Hero là ảnh nếu có khung phù hợp; nơi xa thì dùng landscape vùng đó.
- Thứ tự: hero → visit block → offer → place → order/booking.
- Đa dạng **không cần effect**: offer và place dùng bố cục khác nhau, không lặp “một ảnh tròn ở giữa”; có một type moment (địa chỉ/tên set lớn); một hành động chính mỗi màn; body text 16px.
- Nền phẳng, ảnh vuông, một style button, phone bar, dealt moments. Không effect, ground, loop, fragment, diagram, tab.

### Product và Service — site-kind other
- Ảnh dẫn dắt: sản phẩm, con người, phòng, công việc. Product page nên có từ 2 ảnh/màn trở lên.
- Icon thật cho tool studio dùng; tối đa một diagram tĩnh; nền phẳng và một brand band.
- Không shader, print, grain, gradient, scene, loop (chỉ dealt moments). WebGL chỉ khi brief yêu cầu render 3D.
- Sản phẩm vật lý chưa có ảnh: dùng ảnh stand-in cùng loại, ghi rõ trong report. Render chỉ khi brief yêu cầu 3D/render; không vẽ tay, không mood stock, không set đạo cụ.
- **Mọi product page:** sản phẩm **to**, đứng nguyên vẹn trong khung (hoặc trên nền ở anchor scale), không nằm mid-size trong panel xám bo tròn trên nền xám. Mỗi section một ảnh khác, không lặp một góc. Mọi lời hứa ở headline phải được hình ảnh chứng minh. Swatch đổi ảnh; mỗi màu xuất hiện một lần. Không fact nào lặp hai lần.

### Tech — software, gaming, hardware
- Chủ đề riêng của khách hàng dẫn dắt ở kích thước thật.
- **Software:** UI của chính sản phẩm bằng HTML live, cho thấy nó đang xử lý gì (ví dụ code-review: diff đỏ/xanh + nút Accept) trong một `app-frame`. Không dashboard generic, không chỉ fragment trên panel. Card: fragment trên panel sáng, diagram pulse, icon thật.
- **Hardware:** ảnh thật; nếu không có thì ảnh stand-in cùng loại; render chỉ khi brief yêu cầu 3D. Không hero nửa màn chỉ có form order, không SVG tự vẽ.
- **Game:** tên game trong h1, launch line, thế giới game bằng key art full-bleed; nếu không có art thì tên set lớn trên ảnh stand-in của setting. Effect không được thay thế thế giới game.
- **60–80 từ mỗi màn** ngoài UI mock.
- Theo deal: **một effect** (shader ground ở hero hoặc một frame `[data-visual]`, WebGL part, object hoặc một scene lớn) và **1–2 moment** ở section riêng. Tối đa 4 live WebGL context. Không để card chạy theo scroll.

### Một object không gánh cả trang
- Product/hero object nguyên vẹn dẫn hero và tối đa thêm **2 section**.
- Phần còn lại do loại visual khác mà brief hỗ trợ gánh: thế giới + crew của game; hardware ở bàn làm việc, cận cảnh bộ phận; diagram tĩnh; type moment; ảnh bối cảnh.

### Asset khách hàng có slot riêng
- Trailer, key art, screenshot, CAD render, motion video được brief nêu tên đều phải có khung trông hoàn chỉnh ngay: `<video>` thật với poster stand-in, nút play chỉ khi có trang/file để phát, 3–5 ảnh stand-in của thế giới, CAD frame.
- Ghi tên trong comment để khách hàng thay file; không để slot trống.

---

## 4. Chọn asset theo nhu cầu

| Nhu cầu | Asset / reference |
|---|---|
| Chiều cao, mép, hero, typography | `system.css`, `assets/layout`, `layout-v4.md` |
| Section và recipe | `starter.html`, `sections.md`, `sections-library.md` |
| Token, grid, button, nav, footer, màu | `system.css`, `system.js`, `system.md` |
| Form, keyboard, head/share tags | `starter.html`, `system.css`, `system.js`, `system.md` |
| Copy, contact, credit | `scripts/copy-lint.mjs`, `copy.md`, `copy-voice.md` |
| Hero entrance, hover, press, focus, nav, tab | `assets/motion`, `motion.md` |
| Card loop, count | `assets/motion`, `assets/ui`, `motion.md`, `cards.md` |
| Ảnh | `scripts/photos.mjs`, `photos.md` |
| Icon tool/app/file thật | `scripts/icons.mjs`, `icons.md` |
| Feature card, UI fragment | `assets/ui`, `cards.md` |
| Diagram card (hub, lane, pulse) | `assets/diagrams`, `diagrams.md` |
| CSS ground | `assets/backgrounds`, `backgrounds.md` |
| Shader ground | `assets/effects`, `effects-usage.md` |
| Creative part (`fx-*`) | `assets/components`, `effects-creative.md` |
| Object và print | `assets/objects`, `effects-objects.md` |
| Award-site moment | `assets/moments`, `moments.md` |
| Scene lớn | `assets/scenes`, `scenes.md` |
| Tốc độ và dung lượng | `scripts/perf.mjs`, `perf.md` |

Trước trang đầu tiên, đọc đầy đủ: `copy.md`, `copy-voice.md`, `system.md`, `layout-v4.md`, `sections.md`.

---

## 5. Quy trình chạy

### Bước 0 — Stack
- Thư mục trống: build static page. Copy `<skill>/assets` vào `assets`, bắt đầu từ `assets/starter.html`.
- Project có sẵn: build trong stack của project; component lấy markup/class từ starter; copy kit vào `public/assets` và load như file tĩnh.
- Brief yêu cầu Next.js: build static export (`output: 'export'`), kiểm tra trên trang đã build (`--root out`).

### Bước 1 — Đọc brief
Ghi rõ:
- Kind.
- Bán gì, ai mua.
- Một hành động chính duy nhất (Book a room, Order a cake, Start a free trial; place không có giao dịch: Get directions).
- Material thật: logo, screenshot, ảnh, giá, địa chỉ, giờ mở cửa.

Sau đó arm finish gate trước khi có page:
```bash
node <skill>/scripts/gate.mjs --start index.html --kind <kind> --category "<what is sold>" --primary "<main action>"
```
Framework: truyền URL dev server hoặc trang build. Rebuild trước mỗi lần chạy gate.

### Bước 2 — Viết toàn bộ copy trước
- Theo `copy-voice.md`: fact sheet, voice card, page shape, device budget.
- Theo register/move trong `copy-registers.md`, `copy-moves.md`.
- Trong `copy.md`: h1 nêu category + buyer/place (game: tên + genre); một hard fact ở màn đầu; mỗi heading có noun; button là verb + object.
- Không bịa gì ngoài:
  - Tên brand tự đặt (phải search trước, lưu kết quả vào `names.json`).
  - Với place: giờ/giá hợp lý, đánh dấu `data-assumed`.
- Draft trong `.md` cũng lint như page.

### Bước 3 — Plan page như các màn hình
- Dòng 1: kind.
- Dòng 2: deal + một câu vì sao palette hợp trade.
- Mỗi section một dòng: id, một ý tưởng, picture, loại visual (object/use/parts/world/slot/diagram/type; tối đa 3 dòng object), số màn (1–2), section nào giữ moment và vì sao nó chuyển động; tech thì thêm effect/scene.
- Chọn ảnh ngay; số ảnh quyết định độ dài place.
- Đọc `cards.md` và recipe của mọi id dùng trong `sections-library.md`.

### Bước 4 — Deal, không chọn theo cảm tính
Chạy từ project folder:
```bash
node <skill>/assets/layout/deal.mjs --type <page type> --has <photo,ui,film,object,setting> --history .taste-skill/layout-history.json
node <skill>/scripts/start.mjs deal --page <kind> --trade <trade> --history .taste-skill/history.json
node <skill>/scripts/start.mjs css --page <kind> --palette <id> --type <id> --radius soft --history .taste-skill/history.json
node <skill>/scripts/start.mjs brand --page place --bg "#.." --ink "#.." --accent "#.." --type <id> --radius soft
node <skill>/scripts/moments.mjs pick --page <kind> --count 1|2 --fits section,statement --photo --history .taste-skill/history.json
```
Quy tắc:
- Lấy palette đầu tiên và pairing đầu tiên được in.
- Chỉ đổi khi palette clash với logo/ảnh khách hàng hoặc pairing fail `hero-lines`; ghi lý do ở plan line 2.
- Màu riêng của khách hàng dùng `start.mjs brand`, không dùng `css`.
- **Không bao giờ dùng violet/lavender**; nếu ra thì deal lại.
- Giữ nguyên block `:root` như script in.
- Radius: `sharp` cho fintech/dev tool; `soft` mặc định; `round` cho consumer app; square cho place.
- Tech mới được dùng lit ground (`<html data-ground>`: `sand|sky|sage`), CSS grounds và một effect.
- Ghi mọi kết quả vào plan line 2 + comment đầu `<body>`; build đúng như vậy.

### Bước 5 — Build
- Trong `starter.html`:
  - Set `<html lang data-type data-radius data-buttons data-motion>`.
  - Set 3 meta.
  - Head block: title, description, og, icon, theme-color.
  - Set nav class.
  - Giữ skip link và `m-enter` head line.
- Chỉ copy `<section class="hero …" data-enter>` từ `assets/layout/hero-<id>.html`. Không copy nav, section khác, footer, credit line. Mọi chữ/ảnh đổi thành của khách hàng.
- Move dealt close/footer ra khỏi `<template>` rồi xóa phần còn lại.
- Mỗi section là `main > section`, có một `.wrap`, h2 đứng đầu, `--h: 1` hoặc `2`.
- Build theo recipe bằng class/token của system. Chỉ viết page CSS khi reference cho phép.
- UI lấy từ `assets/ui/<name>/fragment.html`, đổi mọi tên/số/logo sang của khách. Icon kit thành `data-icon`.
- Diagram card: `data-diagram="<preset>"` với label của khách.
- Chạy `icons.mjs scan index.html --out assets/icons --colour` cuối cùng để icon page dùng là file local.
- Effect/object/moment/scene mount đúng reference, không tự viết script.
- Moment section copy từ demo chỉ định; `demo.html` chỉ để xem riêng, không phải page model.
- Form dùng `booking-form` của starter.
- Credit: một dòng footer từ `photos.mjs credits`, chạy sau khi markup đã dùng ảnh.
- Copy tile hero từ `shoot.mjs` thành `share.jpg`.

### Bước 6 — Check và nhìn
Chỉ dùng script của skill, mỗi lần một headless Chrome có WebGL trên CPU, đóng bằng PID, chạy foreground, timeout 10 phút. Không chạy background, không browser windowed, không browser tool.

Mỗi script tự serve page qua http trên `127.0.0.1` (không dùng `file://`). Build có link root (`/_astro/...`) thì truyền `--root dist`.

```bash
node <skill>/scripts/copy-lint.mjs index.html --kind <kind>
node <skill>/scripts/consistency.mjs index.html --widths 1440,1024,820,768,390 --rhythm-widths 1440,820,768,390 --profile <dir> --page <kind> --category "<what is sold>" --primary "<main action>"
node <skill>/assets/layout/check.mjs --url index.html --profile <dir> --sizes 1440x900,1024x768,820x1180,768x1024,390x844 --shots shots/layout
node <skill>/scripts/shoot.mjs --url index.html --w 1440 --out shots/1440.png --profile <dir>
node <skill>/scripts/perf.mjs index.html --profile <dir>
```

- Chụp thêm 1024, 820×1180, 768×1024, 390.
- Mọi finding của `check.mjs` đều fail page (không `--no-stress`).
- Sửa mọi FAIL; WARN của copy-lint cũng sửa hoặc giải thích vì sao giữ.
- Đọc copy thành tiếng; đọc lại screenshot theo checklist.
- Fix round nhanh: `consistency.mjs --quick --widths 1440,390`.
- Chạy gate:
```bash
node <skill>/scripts/gate.mjs index.html
```
- Gate chạy checker ở 1440/390, walk page ở 320 để bắt overflow/collide/tap-size, chạy copy-lint; FAIL đều block.
- Sửa và chạy lại đến khi dòng cuối là `GATE: PASS` hoặc `GATE: OPEN`, tối đa 3 vòng.
- Khi user bảo stop/ship as-is: `gate.mjs --done "<what they said>"` và báo open FAIL.
- `GATE: SETUP`: arm URL browser mở được rồi chạy lại.
- `GATE: ERROR` / `GATE: OFF`: ghi vào report và dừng, không rerun.
- Không sửa file kit hay giấu lỗi. FAIL sai thì waiver trong `.taste-skill/waivers.json` kèm lý do; không gaming check.

### Bước 7 — Report
Báo theo thứ tự:
1. Dòng `GATE:` đầu tiên.
2. Mọi waiver + lý do, mọi open FAIL.
3. Kind, deal: palette + vì sao hợp, pairing, hero, ground, effect, moments, scene.
4. Voice card một dòng + mọi copy-lint WARN giữ lại và lý do.
5. Kết quả checker/layout/perf.
6. Những gì chưa check được.
7. Mọi assumed fact (checker list `assumed`) + search tên brand.
8. Form `.example` stand-in + canonical domain còn thiếu.
9. Ảnh/art khách phải cung cấp, gồm mọi stand-in (library + live search).
10. Mọi client slot, file và stand-in.

---

## 6. Checklist review nhanh

### Màn đầu
- Nói rõ bán gì, cho ai/ở đâu, có một hard fact.
- Hero chiếm trọn màn ở mọi width; main button nằm trong hero.
- Không section sau ló vào.

### Section
- Mỗi section 1–2 màn; h2 đứng đầu và top-aligned.
- Không heading/ảnh của section bên cạnh ló vào.
- Không section nửa rỗng, không quá loãng.

### Mép và layout
- Mọi block nằm trên `.wrap` hoặc cột grid.
- Không lệch một bên, không scroll ngang.
- Không spill/off-viewport/stagger.

### Visual
- Visual nào cũng render ở 1440, 1024, 768, 390.
- Effect bị refuse phải có still fallback.
- Không caption dưới ảnh; credit ở một dòng footer.
- Không placeholder, sample note, địa chỉ `.example` in ra page.

### Đúng loại
- Ngoài tech: không effect ground, print, scene; chỉ dealt moment photo/type. WebGL chỉ khi brief yêu cầu product render.
- Sản phẩm hiện **to, nguyên vẹn** tối đa 3 section, mỗi section ảnh mới.
- Asset brief nêu tên có slot riêng.
- Game: tên + thế giới key art. Software: `app-frame` thật. Code-review: diff thật.
- Ảnh thật nơi phù hợp, không lặp ảnh.
- Icon thật đúng màu.
- Ground phẳng với “other”.
- Place: hai bố cục khác nhau + một type moment.

### Motion
- Button/link/card/ảnh có link đều phản hồi pointer.
- Không tilt.
- Hero entrance một lần.
- 1–2 dealt moment.
- Card loop 2.5–4s.
- Không scroll-linked/scroll-reveal/pinned ngoài moment/scene cho phép.
- Loop >5s phải có pause.
- Reduced motion: mọi thứ đứng yên, không nội dung bị ẩn.
- Tối đa 4 live WebGL context.

### Contact
- Chỉ street + district; không số nhà/postcode/tọa độ.
- Không mã công ty/VAT.
- Không phone đúng format thật.
- `Get directions` chỉ khi có street; `See the area` khi chỉ có district; không map link khi chỉ có town.

### Keyboard và head
- Mọi control có tên; ảnh có alt; label nhìn thấy được.
- Heading đúng cấp, không nhảy cấp.
- Không tabindex > 0.
- Tab chạm skip link đầu tiên; focus ring hiện ngay, không bị header che.
- Menu button nói state.
- Có lang/title/description/share tags.

### Một system
- Một cặp button, một style card, một radius scale, một link look.
- Tối đa 2 lớp box.
- Một heading scale; font load đúng.
- Contrast đạt.

### Copy và link
- Heading gọi tên thứ cụ thể.
- Button là verb + object.
- Hero tối đa 2 action.
- Một action không lặp quá 2 lần/màn.
- Nửa xám của heading là câu riêng.
- Một fact một cách viết.
- Assumed fact được đánh dấu; không dùng assumed để nói “open now”.
- Mọi link mở được, form gửi được; confirmation chỉ sau khi gửi thật; lỗi nằm dưới field.
- Không slop word, stock line, leftover; có voice riêng.

### Performance
- Không FAIL row trong `perf.mjs`: image weight, contexts, layout shift.

### Responsive 820, 768, 390, 320
- Section vẫn đúng số màn.
- Mobile: section ít nhất bằng số màn và lớn theo nội dung, không đè lên nhau/fixed bar.
- Link/control ngoài running text cao tối thiểu 44px.
- Không gì vượt màn ở 320.
- Split stack text trước, không nửa hàng rỗng.
- 390: một cột, button full width, menu full-screen.
- Place: action bar đúng.

### Nhìn bằng mắt
- Đặt cạnh figma.com/x.ai vẫn ra dáng company site chuyên nghiệp.
- Không tilt, stagger, cắt, overlap.
- Hero là tác phẩm, không phải mood.

---

## 7. Những điều tuyệt đối không làm

- Card/row/tile fade-in on scroll; fade-in mọi section; parallax trên text; scroll-jacking; random blinking.
- Ảnh stock giả làm sản phẩm/người/địa điểm của khách. Stand-in phải được ghi rõ, không gắn tên/logo hãng khác. Product page không bao giờ cho thấy sản phẩm.
- Vẽ logo giống logo thật; bịa review/quote/customer/figure.
- Dùng violet/lavender trong thiết kế của page: accent, ground, gradient, effect color, tint.
- Copy code/copy/ảnh/signature effect của reference site.
- Xóa/sửa file kit (`assets/`, `scripts/`) để qua check.

---

## 8. Cách dùng bản tóm tắt này

- Dùng như checklist trước khi build, trong lúc review và trước khi ship.
- Bản này chỉ giữ phần nguyên tắc/quy trình. Để chạy đầy đủ gate, script kiểm tra, ảnh, icon, motion và asset thật, cần tải nguyên thư mục skill:
  - `.agents/skills/design-taste-frontend/SKILL.md`
  - `assets/`
  - `library/`
  - `references/`
  - `scripts/`
- Nếu chỉ có file `.md` này, bạn vẫn dùng được như design brief/checklist, nhưng các lệnh `gate.mjs`, `copy-lint.mjs`, `consistency.mjs`, `check.mjs`, `shoot.mjs`, `perf.mjs` sẽ không chạy được nếu thiếu thư mục `scripts/`.
