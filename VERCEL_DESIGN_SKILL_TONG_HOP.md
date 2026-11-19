---
name: vercel-design-engineering
description: >-
  Skill tổng hợp để build và review UI React/Next.js theo chuẩn Vercel: dùng
  DESIGN.md làm nguồn chân lý về thị giác, kết hợp Vercel Engineering best
  practices cho performance, composition, view transitions, React Native, tối ưu
  chi phí và deploy. Dùng khi thiết kế, build, refactor, audit hoặc ship một
  landing page, dashboard, app React/Next.js hay mobile app Expo.
license: MIT
metadata:
  version: "1.0.0"
  sources:
    - vercel-labs/agent-skills
    - VoltAgent/awesome-design-md
---

# Vercel Design Engineering Skill

> Bản tổng hợp từ:
> - `vercel-labs/agent-skills`: React best practices, composition patterns, view transitions, React Native, Vercel optimize, deploy, CLI token, web interface guidelines, writing guidelines.
> - `awesome-design-md`: phương pháp dùng `DESIGN.md` làm design system cho AI agent; ví dụ cụ thể `design-md/vercel/DESIGN.md`.
>
> Mục tiêu: build UI **đẹp như một design system có chủ đích**, **nhanh như Vercel Engineering**, **ship được lên Vercel**, và **không biến thành template generic**.

---

## 1. Cách kết hợp hai nguồn

| Lớp | Nguồn | Vai trò |
|---|---|---|
| Thị giác | `awesome-design-md` / `DESIGN.md` | Màu, typography, spacing, radius, shadow, component style, responsive, do/don't |
| Kiến trúc | `vercel-composition-patterns` | Compound components, state ownership, API linh hoạt, React 19 |
| Hiệu năng | `vercel-react-best-practices` | Waterfall, bundle, server, client fetching, re-render, rendering, JS |
| Chuyển động | `vercel-react-view-transitions` | Page transition, shared element, Suspense reveal, list identity |
| Mobile | `vercel-react-native-skills` | FlashList, animation, navigation, Expo UI, monorepo |
| Vận hành | `vercel-optimize` | Đọc metrics trước, tối ưu theo bằng chứng, giảm bill |
| Ship | `deploy-to-vercel`, `vercel-cli-with-tokens` | Preview deploy, link project, token auth |
| Quality gate | `web-design-guidelines`, `writing-guidelines` | Accessibility/UX review và prose review |

**Nguyên tắc quan trọng nhất:** chọn **một** `DESIGN.md` làm nguồn thị giác. Không trộn nhiều brand design system trong cùng một sản phẩm. `DESIGN.md` quyết định “trông như thế nào”; skill Vercel quyết định “được build như thế nào”.

---

## 2. Quy trình chuẩn

### Bước 0 — Chọn stack và design contract

1. Xác định loại sản phẩm: marketing site, dashboard, docs, e-commerce, mobile app.
2. Chọn stack: Next.js App Router / Vite React / React Native Expo.
3. Chọn đúng một file:
   - `awesome-design-md/design-md/<brand>/DESIGN.md`
   - hoặc `DESIGN.md` riêng của khách hàng.
4. Đọc **toàn bộ** `DESIGN.md`, không chỉ phần màu.
5. Ghi lại design contract ngắn:
   - 3–5 tính từ về mood.
   - Palette semantic: canvas, surface, ink, body, mute, border, accent, success, error, warning.
   - Font display/body/mono, weight, line-height, tracking.
   - Spacing base, container max-width, section padding.
   - Radius scale.
   - Elevation/shadow scale.
   - Component variants bắt buộc.
   - Breakpoints và touch target.
   - 5 điều “Do”, 5 điều “Don’t”.

### Bước 1 — Chuyển DESIGN.md thành token thật

Không rải hex khắp component. Tạo semantic tokens:

```css
:root {
  --canvas: #ffffff;
  --canvas-soft: #fafafa;
  --surface: #ffffff;
  --ink: #171717;
  --body: #4d4d4d;
  --mute: #888888;
  --hairline: #ebebeb;
  --accent: #171717;
  --accent-ink: #ffffff;
  --link: #0070f3;

  --font-display: Geist, Inter, system-ui, sans-serif;
  --font-body: Geist, Inter, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-24: 96px;
  --space-48: 192px;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 100px;

  --shadow-card:
    0 1px 1px rgb(0 0 0 / 0.02),
    0 2px 2px rgb(0 0 0 / 0.04),
    inset 0 0 0 1px rgb(0 0 0 / 0.08);
}
```

Nếu dùng Tailwind, map token vào `theme.extend` thay vì dùng arbitrary value rải rác.

### Bước 2 — Plan page như các section

Trước khi code, viết plan:

- Một câu: trang này bán/giao gì, cho ai.
- Một hành động chính duy nhất.
- Danh sách section theo thứ tự.
- Mỗi section: mục tiêu, nội dung, visual, CTA, chiều cao ước tính.
- Section nào dùng shared element, section nào dùng reveal, section nào không animate.
- Mobile: section nào stack, section nào rút gọn, section nào ẩn.
- Design tokens nào được dùng ở section nào.

### Bước 3 — Build component

- Dùng semantic HTML trước: `header`, `nav`, `main`, `section`, `footer`.
- Mỗi section có heading đúng cấp; không nhảy cấp.
- Một container width thống nhất.
- Mọi trạng thái component phải có: default, hover, focus-visible, active, disabled, loading, error, empty.
- Không tạo biến thể bằng cách thêm Boolean prop. Dùng composition hoặc variant rõ ràng.
- Component không tự biết business logic nếu không cần.
- Server Component mặc định; chỉ `"use client"` ở boundary thật sự cần state/effect/event.

### Bước 4 — Performance pass

- Loại bỏ waterfall trước khi tối ưu vặt.
- Song song hoá fetch độc lập.
- Giảm bundle trước khi thêm animation.
- Không memo hoá tràn lan; chỉ memo khi đo thấy cost.
- Không đưa state không cần thiết vào client.
- Đo bằng Lighthouse/React Profiler/perf script, không đoán.

### Bước 5 — Motion pass

- Chỉ thêm view transition khi nó truyền đạt quan hệ không gian/continuity.
- Shared element cho “cùng một thứ, đi sâu hơn”.
- Directional slide chỉ cho hierarchical navigation hoặc ordered sequence.
- Tab ngang, filter, revalidation: fade hoặc `default="none"`.
- Luôn có reduced-motion.
- Không dùng animation để che layout chậm.

### Bước 6 — Accessibility và responsive

- Keyboard đi hết flow.
- Focus ring hiện rõ, không bị sticky header che.
- Mọi ảnh có alt phù hợp; ảnh decorative dùng alt rỗng.
- Form có label nhìn thấy được; lỗi nằm dưới field.
- Touch target tối thiểu 44×44px.
- Kiểm tra 320/390/768/1024/1440.
- Không có scroll ngang.
- Contrast đạt WCAG AA.

### Bước 7 — Test và review

- Unit/component test cho logic quan trọng.
- E2E cho flow chính.
- Review UI bằng `web-design-guidelines`.
- Review copy bằng `writing-guidelines`.
- Chạy `vercel-optimize` nếu đã deploy và có traffic.

### Bước 8 — Deploy

- Mặc định deploy **preview**, không production.
- Ưu tiên git push nếu project đã link và có git remote.
- Kiểm tra `.vercel/project.json` hoặc `.vercel/repo.json`.
- Không đưa token vào command line.
- Sau deploy, lấy URL preview và kiểm tra lại.

---

## 3. DESIGN.md — cấu trúc và cách dùng

Mỗi `DESIGN.md` trong `awesome-design-md` thường có 9 phần:

1. **Visual Theme & Atmosphere** — mood, density, triết lý.
2. **Color Palette & Roles** — tên semantic + hex + vai trò.
3. **Typography Rules** — font family, hierarchy, weight, line-height, tracking.
4. **Component Stylings** — button, card, input, nav và states.
5. **Layout Principles** — spacing scale, grid, whitespace.
6. **Depth & Elevation** — shadow system, surface hierarchy.
7. **Do's and Don'ts** — guardrails, anti-pattern.
8. **Responsive Behavior** — breakpoints, touch target, collapsing.
9. **Agent Prompt Guide** — quick reference, prompt mẫu.

### Cách dùng đúng

- Copy `DESIGN.md` vào project root.
- Đọc hết file trước khi code.
- Chuyển token thành CSS variables/Tailwind theme.
- Dùng preview HTML của bộ đó để đối chiếu.
- Giữ đúng hierarchy, spacing rhythm, radius scale và shadow language.
- Thay toàn bộ brand name/logo/nội dung bằng của khách hàng.
- Dùng như **hệ thống tham chiếu**, không copy code/asset/copy nguyên bản.
- Không trộn token của nhiều brand.
- Nếu brief không khớp brand gốc, adapt có lý do; ghi rõ chỗ đã lệch.

### Checklist trước khi code

- [ ] Đã chọn đúng một `DESIGN.md`.
- [ ] Đã đọc hết 9 phần.
- [ ] Đã trích xuất semantic tokens.
- [ ] Đã xác định font thay thế nếu font gốc proprietary.
- [ ] Đã xác định radius/shadow scale.
- [ ] Đã xác định breakpoints.
- [ ] Đã xác định component variants.
- [ ] Đã xác định 5 Do / 5 Don't.
- [ ] Đã lên section plan.
- [ ] Đã xác định motion nào thật sự cần.

---

## 4. Ví dụ: Vercel DESIGN.md

File: `awesome-design-md/design-md/vercel/DESIGN.md`

### Mood

Developer-platform, kỹ thuật, chính xác, ít trang trí. Nền gần trắng, ink gần đen, một mesh gradient nhiều màu làm toàn bộ hệ thống trang trí. Cảm giác “engineered”, không “art piece”.

### Palette cốt lõi

| Token | Hex | Dùng cho |
|---|---|---|
| `canvas` | `#ffffff` | Card, dialog, surface trắng |
| `canvas-soft` | `#fafafa` | Nền trang mặc định |
| `canvas-soft-2` | `#f5f5f5` | Vùng inset, hover, dropdown |
| `ink` | `#171717` | Heading, body, CTA chính |
| `body` | `#4d4d4d` | Text phụ |
| `mute` | `#888888` | Placeholder, fine print |
| `hairline` | `#ebebeb` | Border 1px, divider |
| `link` | `#0070f3` | Link |
| `gradient-develop` | `#007cf0 → #00dfd8` | Mesh gradient |
| `gradient-preview` | `#7928ca → #ff0080` | Mesh gradient |
| `gradient-ship` | `#ff4d4d → #f9cb28` | Mesh gradient |

### Typography

- Display/body: **Geist** hoặc substitute **Inter**.
- Mono: **Geist Mono** hoặc substitute **JetBrains Mono**.
- Display weight tối đa **600**, không dùng 700/800.
- Hero 48px/48px, tracking `-2.4px`.
- Section 32px/40px, tracking `-1.28px`.
- Body 16px/24px.
- Mono 12–13px cho eyebrow, code, terminal.
- Heading sentence-case, thường kết thúc bằng dấu chấm.
- Không all-caps heading.
- Không set body bằng mono.

### Layout

- Base spacing 4px.
- Section padding 64–96px; hero có thể 192px.
- Container tối đa ~1400px.
- Gutter desktop 24px, mobile 16px.
- Grid 3-up → 2-up → 1-up.
- Whitespace: khoảng lớn giữa band, khoảng tight trong card.
- Breakpoints: `<600`, `600–959`, `960–1199`, `1200–1399`, `≥1400`.
- Touch target tối thiểu 44×44px.

### Shape và elevation

- Nav button: 6px.
- Marketing card: 8px.
- Large card/pricing: 12px.
- Marketing CTA: pill 100px.
- Card mặc định: inset hairline + stacked shadow nhẹ.
- Không dùng một drop-shadow lớn.
- Dark band polarity-flip là depth cue chính.

### Component signatures

- `button-primary`: pill đen, chữ trắng.
- `button-secondary`: pill trắng, chữ đen.
- `nav-cta-*`: button nhỏ 28px, radius 6px.
- `card-marketing`: card trắng, radius 8px, padding 24px.
- `card-marketing-large`: card trắng, radius 12px, padding 32px.
- `code-editor-mockup`: nền ink, chữ mono, radius 8px.
- `form-input`: cao 40px, radius 6px, border hairline.
- `nav-bar`: cao 64px, logo trái, link giữa, CTA phải.
- `hero-band`: headline sentence-case, body lead, 2 CTA, mesh gradient phía sau.
- `showcase-band-dark`: band đen, chữ trắng, thường chứa code mockup.
- `pricing-card-featured`: card đảo màu ink, CTA trắng.

### Do

- Dùng ink cho mọi CTA chính.
- Dùng pill 100px cho marketing CTA.
- Dùng display 600, sentence-case, negative tracking.
- Dùng mesh gradient ở hero scale.
- Dùng stacked shadow + inset hairline.
- Cycle surface: canvas-soft → canvas → ink band.
- Dùng mono cho code/technical label.

### Don't

- Không thêm accent thứ sáu.
- Không all-caps headline.
- Không single heavy drop-shadow.
- Không thu nhỏ gradient thành icon/swatch.
- Không dùng weight 700.
- Không trộn pill 100px và radius 6px tùy tiện trong cùng một scale.
- Không set body bằng mono.

---

## 5. Vercel React Best Practices

Nguồn: `vercel-react-best-practices`.

### Ưu tiên theo impact

| Ưu tiên | Nhóm | Impact | Prefix |
|---|---|---|---|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Server-Side Performance | HIGH | `server-` |
| 4 | Client-Side Data Fetching | MEDIUM-HIGH | `client-` |
| 5 | Re-render Optimization | MEDIUM | `rerender-` |
| 6 | Rendering Performance | MEDIUM | `rendering-` |
| 7 | JavaScript Performance | LOW-MEDIUM | `js-` |
| 8 | Advanced Patterns | LOW | `advanced-` |

### 5.1 Eliminating Waterfalls — CRITICAL

- Kiểm tra điều kiện sync rẻ trước khi await remote flag.
- Chỉ await trong branch thật sự dùng.
- `Promise.all()` cho operation độc lập.
- Dùng dependency-aware parallel fetch cho partial dependency.
- API route: start promise sớm, await muộn.
- Dùng Suspense để stream content.

```tsx
const [user, posts] = await Promise.all([getUser(id), getPosts(id)]);
```

### 5.2 Bundle Size — CRITICAL

- Import trực tiếp; tránh barrel file.
- Dùng path tĩnh, analyzable.
- `next/dynamic` cho component nặng.
- Defer analytics/logging đến sau hydration.
- Chỉ load module khi feature được kích hoạt.
- Preload khi hover/focus nếu giảm perceived latency.

### 5.3 Server-Side Performance — HIGH

- Authenticate server actions như API route.
- `React.cache()` cho per-request dedup.
- LRU cache cho cross-request.
- Tránh duplicate serialization trong RSC props.
- Hoist static I/O (font, logo) lên module level.
- Không giữ mutable request state ở module level trong RSC/SSR.
- Giảm dữ liệu truyền xuống client.
- Restructure component để fetch song song.
- Nested fetch theo item: `Promise.all` đúng cách.
- Dùng `after()` cho việc không blocking response.

### 5.4 Client-Side Data Fetching — MEDIUM-HIGH

- SWR cho dedup request.
- Dedup global event listener.
- Passive listener cho scroll.
- Version và minimize localStorage schema.

### 5.5 Re-render Optimization — MEDIUM

- Không subscribe state chỉ dùng trong callback.
- Tách expensive work vào memoized component.
- Hoist default non-primitive props.
- Dùng primitive dependency trong effect.
- Subscribe derived boolean thay vì raw value.
- Derive state trong render, không dùng effect.
- Functional `setState` cho callback ổn định.
- Lazy init `useState` cho expensive value.
- Không `useMemo` cho primitive đơn giản.
- Tách hook có dependency độc lập.
- Đưa interaction logic vào event handler.
- `startTransition` cho update không gấp.
- `useDeferredValue` cho render chậm.
- Dùng ref cho transient frequent value.
- Không define component bên trong component.

### 5.6 Rendering Performance — MEDIUM

- Animate wrapper `div`, không animate SVG element.
- `content-visibility` cho danh sách dài.
- Hoist static JSX ra ngoài component.
- Giảm precision tọa độ SVG.
- Inline script cho client-only data để tránh flicker.
- Suppress hydration warning chỉ khi mismatch được hiểu.
- `Activity` cho show/hide.
- Dùng ternary thay vì `&&` cho conditional render.
- `useTransition` cho loading state.
- React DOM resource hints để preload.
- `defer`/`async` cho script.

### 5.7 JavaScript Performance — LOW-MEDIUM

- Batch DOM/CSS bằng class hoặc `cssText`.
- Map cho lookup lặp.
- Cache property access trong loop.
- Cache function result ở module-level Map.
- Cache localStorage/sessionStorage read.
- Gộp filter/map thành một loop.
- Check length trước so sánh tốn kém.
- Early return.
- Hoist RegExp ra ngoài loop.
- Loop cho min/max thay vì sort.
- Set/Map cho O(1) lookup.
- `toSorted()` cho immutability.
- `flatMap` để map + filter một pass.
- `requestIdleCallback` cho việc không gấp.

### 5.8 Advanced Patterns — LOW

- Không đưa `useEffectEvent` result vào effect deps.
- Lưu event handler trong ref.
- Init app một lần mỗi app load.
- `useLatest` cho stable callback ref.

### Quy tắc thực chiến

- Đo trước, tối ưu sau.
- Ưu tiên bỏ waterfall và giảm bundle trước khi vi tối ưu JS.
- Không bọc `memo` mọi thứ.
- Không đưa toàn bộ page thành client component.
- Không serialize dữ liệu lớn qua RSC boundary.

---

## 6. Composition Patterns

Nguồn: `vercel-composition-patterns`.

### Khi nào dùng

- Component có quá nhiều Boolean prop.
- Cần component library linh hoạt.
- Cần compound component.
- Cần context provider.
- Cần API ổn định cho nhiều team dùng.

### Nguyên tắc

1. **Tránh Boolean prop proliferation.**
   - Sai: `<Card isCompact isHighlighted isClickable hasIcon />`
   - Đúng: `<Card variant="compact">`, `<Card.Highlight>`, `<Card.Icon>`.

2. **Compound component + shared context.**
   - `Tabs`, `Tabs.List`, `Tabs.Trigger`, `Tabs.Panel`.
   - Context giữ state và API nội bộ.

3. **Provider là nơi duy nhất biết state được quản lý thế nào.**
   - Consumer không phụ thuộc Redux/Zustand/useState cụ thể.

4. **Context interface generic.**
   - Gồm `state`, `actions`, `meta`.
   - Dễ test, dễ thay implementation.

5. **Lift state lên provider khi sibling cần đọc.**
   - Không truyền prop xuyên nhiều tầng.

6. **Variant component rõ ràng thay vì Boolean mode.**
   - `PrimaryButton`, `GhostButton`, hoặc `variant="primary"`.

7. **Children thay vì renderX props.**
   - `<Layout header={<Header />}>...</Layout>` dễ đọc hơn `renderHeader`.

8. **React 19+**
   - Không dùng `forwardRef`.
   - Dùng `use()` thay `useContext()` khi phù hợp.
   - Chỉ áp dụng nếu project thật sự React 19+.

### Mẫu compound component

```tsx
const TabsContext = createContext<TabsApi | null>(null);

function Tabs({ children, defaultValue }: TabsProps) {
  const [value, setValue] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div role="tablist">{children}</div>
    </TabsContext.Provider>
  );
}

function Trigger({ value, children }: TriggerProps) {
  const tabs = use(TabsContext);
  return (
    <button role="tab" aria-selected={tabs.value === value} onClick={() => tabs.setValue(value)}>
      {children}
    </button>
  );
}
```

---

## 7. React View Transitions

Nguồn: `vercel-react-view-transitions`.

### Nguyên tắc gốc

Mỗi `<ViewTransition>` phải truyền đạt một quan hệ không gian hoặc continuity. Nếu không giải thích được nó nói lên điều gì, đừng thêm.

### Thứ tự ưu tiên pattern

1. **Shared element** (`name`) — “cùng một thứ, đi sâu hơn”.
2. **Suspense reveal** — “dữ liệu đã tải xong”.
3. **List identity** (`key` theo item) — “cùng item, sắp xếp mới”.
4. **State change** (`enter`/`exit`) — “xuất hiện/biến mất”.
5. **Route change** — “đi đến nơi mới”.

Đây là thứ tự implementation, không phải chọn một. Làm mọi pattern phù hợp.

### Chọn animation

| Context | Animation | Lý do |
|---|---|---|
| List → detail | `nav-forward` / `nav-back` | Truyền đạt depth |
| Tab ngang | fade hoặc `default="none"` | Không có depth |
| Suspense reveal | `enter`/`exit` | Content đến |
| Revalidation/background | `default="none"` | Im lặng |
| Ordered sequence | directional slide | Hướng = vị trí |

### Điều kiện chạy

- Next.js App Router: `ViewTransition` có sẵn, không cài `react@canary`.
- Ngoài Next.js: React/ReactDOM **19.3+**.
- Browser: Chromium 125+, Firefox 144+, Safari 18.2+.
- Unsupported browser tự bỏ animation.

### Trigger

Chỉ `startTransition`, `useDeferredValue`, hoặc `Suspense` kích hoạt view transition. `setState` thường không animate.

### Placement rule

`<ViewTransition>` chỉ kích hoạt enter/exit nếu nó đứng **trước mọi DOM node**:

```tsx
// Đúng
<ViewTransition enter="auto" exit="auto">
  <div>Content</div>
</ViewTransition>

// Sai — div bọc ngoài làm mất enter/exit
<div>
  <ViewTransition enter="auto" exit="auto">
    <div>Content</div>
  </ViewTransition>
</div>
```

### Shared element

```tsx
<ViewTransition name={`photo-${id}`}>
  <img src={thumb} />
</ViewTransition>

// View đích
<ViewTransition name={`photo-${id}`}>
  <img src={full} />
</ViewTransition>
```

- Chỉ một VT cùng `name` được mount tại một thời điểm.
- `share` ưu tiên hơn `enter`/`exit`.
- Nếu dùng `default="none"`, phải khai báo `share` rõ.
- Link cần morph phải add transition type.
- Không dùng fade-out exit trên page có shared morph.

### Type-keyed animation

```tsx
startTransition(() => {
  addTransitionType("nav-forward");
  router.push(`/detail/${id}`);
});
```

```tsx
<ViewTransition
  enter={{ "nav-forward": "slide-from-right", "nav-back": "slide-from-left", default: "none" }}
  exit={{ "nav-forward": "slide-to-left", "nav-back": "slide-to-right", default: "none" }}
  share="morph"
/>
```

- `router.back()` và browser back không mang type.
- Type không có trong Suspense reveal sau đó.
- `default="none"` tắt cả update/share nếu không khai báo lại.

### Accessibility

Luôn thêm CSS reduced motion. Không để nội dung bị ẩn khi reduced motion bật.

---

## 8. React Native / Expo

Nguồn: `vercel-react-native-skills`.

### Ưu tiên

| Ưu tiên | Nhóm | Impact |
|---|---|---|
| 1 | List Performance | CRITICAL |
| 2 | Animation | HIGH |
| 3 | Navigation | HIGH |
| 4 | UI Patterns | HIGH |
| 5 | State Management | MEDIUM |
| 6 | Rendering | MEDIUM |
| 7 | Monorepo | MEDIUM |
| 8 | Configuration | LOW |

### List performance

- Dùng **FlashList** cho list lớn.
- Memoize item component.
- Stabilize callback reference.
- Không tạo inline style object trong item.
- Extract function ra ngoài render.
- Optimize image trong list.
- Đưa expensive work ra ngoài item.
- Dùng item types cho heterogeneous list.

### Animation

- Chỉ animate `transform` và `opacity`.
- `useDerivedValue` cho computed animation.
- `Gesture.Tap` thay `Pressable` khi cần gesture.

### Navigation

- Native stack/native tabs thay JS navigator khi có thể.

### UI patterns

- `expo-image` cho mọi ảnh.
- Galeria cho lightbox.
- `Pressable` thay `TouchableOpacity`.
- Safe area đúng trong ScrollView.
- `contentInset` cho header.
- Native context menu/modal khi có thể.
- `onLayout` thay `measure()`.
- `StyleSheet.create` hoặc NativeWind.

### State và rendering

- Giảm state subscription.
- Dispatcher pattern cho callback.
- Fallback ở first render.
- Destructure function cho React Compiler.
- Shared value với Reanimated đúng cách.
- Wrap text trong `<Text>`.
- Tránh falsy `&&` cho conditional render.

### Monorepo và config

- Native dependency nằm trong app package.
- Một version dependency cho toàn monorepo.
- Custom font qua config plugin.
- Tổ chức import design system theo folder.
- Hoist `Intl` object.

---

## 9. Vercel Optimize

Nguồn: `vercel-optimize`.

### Doctrine

- **Metrics first**: bắt đầu từ production signals, không grep repo.
- **Deterministic gates**: script quyết định candidate nào đáng điều tra.
- **Candidate-bound scope**: chỉ đọc file được candidate chỉ định hoặc import chain của route.
- **Version-aware citations**: chỉ dùng docs library đã cấu hình.
- **Customer copy**: đọc voice guide trước khi viết report.

### Hỗ trợ framework

| Framework | Hỗ trợ |
|---|---|
| Next.js App Router | Mạnh nhất |
| Next.js Pages Router | Có |
| SvelteKit | Có route mapping |
| Nuxt | Có, ít framework-specific hơn |
| Astro | Giới hạn |
| Hono/Remix/khác | Block mặc định |

### Pipeline

1. Collect signals:
```bash
node scripts/collect-signals.mjs [projectId] > "$RUN_DIR/vercel-signals.json" 2> "$RUN_DIR/collect.stderr"
node scripts/scan-codebase.mjs <repo-root> > "$RUN_DIR/codebase.json"
node scripts/merge-signals.mjs "$RUN_DIR/vercel-signals.json" "$RUN_DIR/codebase.json" --out "$RUN_DIR/signals.json"
```
2. Gate candidates:
```bash
node scripts/gate-investigations.mjs "$RUN_DIR/signals.json" > "$RUN_DIR/gate.json"
```
3. Deep-dive + reconcile:
```bash
node scripts/deep-dive.mjs "$RUN_DIR/signals.json" "$RUN_DIR/gate.json" --cwd <project-dir> > "$RUN_DIR/investigation-evidence.json"
node scripts/reconcile-candidates.mjs "$RUN_DIR/investigation-evidence.json" --gate "$RUN_DIR/gate.json" --out "$RUN_DIR/reconciled-investigation.json"
```

### Nguyên tắc an toàn

- Không đặt auth token trong shell command.
- Không tự fallback sang code-only audit khi chưa hỏi user.
- Nếu project/team scope mơ hồ, dừng và hỏi.
- Không tái sử dụng run directory giữa các audit.
- Không đưa ra recommendation không có metric backing.
- Luôn phân biệt code candidate, platform recommendation và gated item.

### Khi nào dùng

- Bill Vercel tăng.
- Route chậm.
- Function Invocations/Build Minutes/Fast Data Transfer cao.
- Core Web Vitals kém.
- Cần audit caching, Fluid compute, Bot Management.

---

## 10. Deploy lên Vercel

Nguồn: `deploy-to-vercel`, `vercel-cli-with-tokens`.

### Nguyên tắc

- **Luôn deploy preview**, trừ khi user nói rõ production.
- Mục tiêu dài hạn: project linked + git push auto deploy.
- Không push/commit nếu user chưa cho phép.
- Không đưa token vào command line.
- Ưu tiên `vercel link --repo` khi có git remote.
- Kiểm tra cả `.vercel/project.json` và `.vercel/repo.json`.

### Kiểm tra state

```bash
git remote get-url origin 2>/dev/null
cat .vercel/project.json 2>/dev/null || cat .vercel/repo.json 2>/dev/null
vercel whoami 2>/dev/null
vercel teams list --format json 2>/dev/null
```

### Chọn cách deploy

| State | Cách |
|---|---|
| Linked + có git remote | Hỏi user, commit, push |
| Linked + không git remote | `vercel deploy [path] -y --no-wait` |
| Chưa link + CLI auth | Chọn team → `vercel link --repo` → deploy |
| Chưa link + chưa auth | Cài CLI → login → link → deploy |
| Không thể login | `npx vercel@latest deploy [path] --temporary -y` |

### Preview deploy

```bash
vercel deploy [path] -y --no-wait --scope <team-slug>
vercel inspect <deployment-url>
```

### Production chỉ khi được yêu cầu

```bash
vercel deploy [path] --prod -y --no-wait --scope <team-slug>
```

### Token auth

```bash
export VERCEL_TOKEN="..."
vercel deploy -y --no-wait
```

Không dùng:
```bash
vercel deploy --token "..."   # sai: lộ token
```

### Temporary deploy

```bash
npx vercel@latest deploy [path] --temporary -y
```

Nói rõ với user: URL, thời gian hết hạn, claim URL, không chia sẻ claim link.

---

## 11. Web Interface Guidelines và Writing Guidelines

### Web Interface Guidelines

Dùng khi review UI/accessibility/UX.

Quy trình:
1. Fetch guidelines mới nhất từ:
   `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
2. Đọc file/pattern người dùng chỉ định.
3. Check toàn bộ rule.
4. Output dạng ngắn gọn `file:line`.

Không tự bịa rule; luôn fetch bản mới nhất.

### Writing Guidelines

Dùng khi review docs/prose.

Quy trình:
1. Fetch:
   `https://raw.githubusercontent.com/vercel-labs/writing-guidelines/main/command.md`
2. Đọc file/pattern.
3. Check rule.
4. Output `file:line`.

---

## 12. Checklist tổng hợp trước khi ship

### Design

- [ ] Chỉ dùng một `DESIGN.md`.
- [ ] Token semantic được map đúng.
- [ ] Typography hierarchy đúng.
- [ ] Spacing rhythm đúng.
- [ ] Radius scale đúng.
- [ ] Shadow/elevation đúng.
- [ ] Component states đầy đủ.
- [ ] Không trộn brand language.
- [ ] Không copy asset/code/copy gốc.
- [ ] Hero/landing có điểm nhấn rõ, không generic.
- [ ] Ảnh/visual thật, không placeholder.
- [ ] Copy có voice riêng, không sáo rỗng.

### React / Next.js

- [ ] Không có waterfall không cần thiết.
- [ ] Fetch độc lập chạy song song.
- [ ] Bundle không import thừa.
- [ ] Heavy component dynamic import.
- [ ] Server/client boundary hợp lý.
- [ ] Không serialize dữ liệu lớn.
- [ ] Không memo tràn lan.
- [ ] Không define component trong component.
- [ ] List dài có virtualize/content-visibility.
- [ ] Ảnh có kích thước, không layout shift.
- [ ] Loading/error/empty state đầy đủ.

### Composition

- [ ] Không có Boolean prop proliferation.
- [ ] Compound component dùng context đúng.
- [ ] State nằm đúng nơi.
- [ ] API component dễ đọc.
- [ ] React 19 API dùng đúng.

### Motion

- [ ] Mỗi view transition có ý nghĩa.
- [ ] Shared element unique name.
- [ ] Directional slide chỉ dùng đúng chỗ.
- [ ] `default="none"` được dùng có chủ đích.
- [ ] Reduced motion hoạt động.
- [ ] Không animate layout property.

### Accessibility

- [ ] Keyboard đi hết flow.
- [ ] Focus visible.
- [ ] Alt text đúng.
- [ ] Form label + error đúng.
- [ ] Heading đúng cấp.
- [ ] Contrast đạt.
- [ ] Touch target 44px.
- [ ] Không scroll ngang ở 320.
- [ ] Skip link nếu cần.

### Performance

- [ ] Không FAIL trong perf audit.
- [ ] Ảnh đúng kích thước/format.
- [ ] Font load hợp lý.
- [ ] Không layout shift.
- [ ] Bundle size trong ngưỡng.
- [ ] Không có render thừa rõ ràng.

### Deploy

- [ ] Deploy preview.
- [ ] Kiểm tra URL preview.
- [ ] Không lộ token.
- [ ] Env vars đúng scope.
- [ ] Project link đúng team.
- [ ] Nếu optimize: có metrics backing.

---

## 13. Những điều tuyệt đối không làm

- Không trộn nhiều `DESIGN.md`/brand language trong một sản phẩm.
- Không copy code, copy, ảnh, logo hoặc signature effect của site tham chiếu.
- Không dùng font/weight/radius/shadow sai spec.
- Không thêm accent color thứ sáu khi design system đã đủ.
- Không dùng all-caps heading nếu DESIGN.md không quy định.
- Không dùng single heavy drop-shadow thay stacked elevation.
- Không animate mọi thứ hoặc thêm view transition vô nghĩa.
- Không dùng `forwardRef` trong React 19 nếu không cần.
- Không gọi `document.startViewTransition` thủ công khi dùng `<ViewTransition>`.
- Không bọc `<ViewTransition>` trong `<div>` làm mất enter/exit.
- Không thêm `"use client"` cho cả page chỉ vì một component nhỏ.
- Không đưa token vào command line hoặc log.
- Không deploy production khi user chưa yêu cầu rõ.
- Không push/commit khi user chưa cho phép.
- Không tối ưu Vercel bằng grep repo khi chưa có metrics.
- Không đưa ra recommendation không có file/metric chứng minh.
- Không tạo component generic “AI-looking” khi brief cần bản sắc riêng.

---

## 14. Nguồn tham chiếu

### Vercel agent skills

- `~/.agents/skills/vercel-react-best-practices/`
- `~/.agents/skills/vercel-composition-patterns/`
- `~/.agents/skills/vercel-react-view-transitions/`
- `~/.agents/skills/vercel-react-native-skills/`
- `~/.agents/skills/vercel-optimize/`
- `~/.agents/skills/deploy-to-vercel/`
- `~/.agents/skills/vercel-cli-with-tokens/`
- `~/.agents/skills/web-design-guidelines/`
- `~/.agents/skills/writing-guidelines/`

### Awesome DESIGN.md

- `awesome-design-md/README.md`
- `awesome-design-md/design-md/vercel/DESIGN.md`
- Các brand khác trong `awesome-design-md/design-md/<brand>/DESIGN.md`

### Cách dùng file này

- Dùng như `SKILL.md` bằng cách copy vào:
  - `.agents/skills/vercel-design-engineering/SKILL.md`
  - hoặc `.claude/skills/vercel-design-engineering/SKILL.md`
- Nếu chỉ cần checklist, giữ file ở project root và đọc trực tiếp.
- Các lệnh trong file cần source skill gốc để chạy đầy đủ (`scripts/`, `references/`, `rules/`).
