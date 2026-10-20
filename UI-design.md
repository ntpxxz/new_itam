# UI Design — AssetFlow

ระบบจัดการทรัพย์สินไอที · 2026-10-20

เอกสารนี้สรุปหลักการออกแบบและองค์ประกอบ UI ของ AssetFlow ไว้เป็นแนวทางสำหรับทีมพัฒนาและออกแบบในระยะต่อไป

---

## 1. หลักการออกแบบ (Design Principles)

**Clarity over cleverness** — ผู้ใช้คือพนักงาน IT ที่ต้องทำงานเร็ว อ่านง่ายต้องมาก่อนความสวยงาม

**One primary action per screen** — แต่ละหน้ามี primary button ได้แค่หนึ่ง เพื่อไม่ให้สับสนว่าต้องกดอะไรก่อน

**Scan, don't read** — ตารางและ dashboard ถูกออกแบบให้ scan ด้วยสายตา ไม่ใช่อ่านทีละบรรทัด

**Status is visual** — สถานะอุปกรณ์ต้องสื่อด้วยสี + รูปทรง (chip) ไม่ใช่สีอย่างเดียว เพื่อให้คนตาบอดสีแยกได้

**Mobile-aware** — ระบบนี้ต้องใช้บนมือถือเวลาสแกน QR และยืม-คืน จึงต้องรองรับจอเล็กและปุ่มที่กดง่าย

---

## 2. Color Palette

### สีหลัก (จาก brand palette)

| Token | Hex | ใช้งาน |
|---|---|---|
| Indigo | `#170C79` | Primary — ปุ่มหลัก, link, nav active, status "ถูกยืม/เบิกถาวร" |
| Light Teal | `#DFF1F1` | Soft background — ชิป "พร้อมใช้" |
| Muted Blue-Gray | `#BBD5DA` | Border หลัก, divider ที่ต้องเห็นชัด |
| Light Gray | `#F5F5F5` | พื้นหลังของแอป |
| Red | `#FF0000` | Danger — ชิป Scrap, error, แจ้งเตือนวิกฤต |

### สีขยาย (derived)

| Token | Hex | ใช้งาน |
|---|---|---|
| Surface | `#FFFFFF` | พื้นหลังของ card, sidebar, topbar |
| Border (light) | `#E6ECEE` | เส้นแบ่งเบาๆ ในตาราง |
| Text (default) | `#0F0A3D` | ตัวอักษรหลัก (indigo-tinted dark) |
| Text (muted) | `#5B6472` | label, caption, cell รอง |
| Text (subtle) | `#94A3B8` | asset tag, placeholder, metadata |
| Primary soft | `#E5E3F3` | พื้น nav active, chip ที่ใช้ indigo |
| Primary hover | `#0F0858` | สีเข้มขึ้นเมื่อ hover ปุ่มหลัก |
| Danger soft | `#FFE4E4` | พื้นชิป Scrap |

### Semantic status

| สถานะ | พื้นชิป | สีตัวอักษร |
|---|---|---|
| พร้อมใช้ | `#DFF1F1` | `#0E6B6B` |
| ถูกยืม | `#E5E3F3` | `#170C79` |
| เบิกถาวร | `#E5E3F3` | `#170C79` |
| กำลังซ่อม | `#FEF3C7` | `#B45309` |
| Scrap | `#FFE4E4` | `#FF0000` |

**กฎการใช้สี** — สีหนึ่งสีไม่ควรใช้แทนสองความหมาย เช่น indigo = primary อย่างเดียว ห้ามเอาไปใช้กับ "สำเร็จ"

---

## 3. Typography

### Font stack

- **Body & UI**: `IBM Plex Sans Thai` → Latin fallback → system sans
- **Numbers & IDs**: `IBM Plex Mono` → system monospace

เลือก IBM Plex Sans Thai เพราะอ่านง่าย รูปตัวหนังสือเรียบ แสดงผลดีทั้งไทยและอังกฤษในขนาดเล็ก

### Type scale

| Role | Size | Weight | Line-height | Notes |
|---|---|---|---|---|
| Page title | 22px | 600 | 1.3 | `letter-spacing: -0.015em`, `text-wrap: balance` |
| Section title | 15px | 600 | 1.4 | |
| Body | 14px | 400 | 1.5 | default |
| Table cell | 13px | 400 | 1.5 | |
| Caption / meta | 12px | 400 | 1.4 | สี muted |
| KPI number | 26px | 600 | 1.1 | font-mono, `tabular-nums` |
| Nav label | 10.5px | 500 | — | uppercase, `letter-spacing: 0.1em` |

**ใช้ weight แค่ 2 ระดับ**: 400 (regular) และ 500/600 (medium/semibold) หลีกเลี่ยง bold หนาจัด

---

## 4. Spacing

ใช้ scale 4px เป็นหน่วยพื้นฐาน: `4, 8, 12, 16, 20, 24, 32, 48`

| ส่วน | padding | gap |
|---|---|---|
| Main content | 24px | — |
| Card | 16px | — |
| KPI card | 16-18px | 12px ระหว่าง card |
| Table cell | 10-12px × 16px | — |
| Button | 8px × 14px | 6px ไอคอน-ตัวอักษร |
| Nav item | 7px × 10px | 10px ระหว่าง item |

---

## 5. Layout

**Grid หลัก**

```
┌──────────┬────────────────────────┐
│          │ Topbar (60px)          │
│ Sidebar  ├────────────────────────┤
│ (240px)  │                        │
│          │ Content area           │
│          │ (max-width 1440px)     │
│          │                        │
└──────────┴────────────────────────┘
```

**Content area** จัดเป็น section จากบนลงล่าง: page header → KPI row → alert row → ตาราง + activity

**เนื้อหา 2 คอลัมน์** (desktop ≥1100px): ตารางหลัก (ยืดได้) + activity feed (300px fixed)

---

## 6. Responsive breakpoints

| Breakpoint | พฤติกรรม |
|---|---|
| `≥1100px` | layout เต็มรูปแบบ 2 คอลัมน์ |
| `<1100px` | activity feed ย้ายลงล่างตาราง |
| `<900px` | KPI เหลือ 2 คอลัมน์ |
| `<760px` | sidebar ยุบเป็น hamburger + scrim, main padding ลดเหลือ 16px |
| `<460px` | KPI เหลือ 1 คอลัมน์, search ขยายเต็มความกว้าง |

**ปุ่มและพื้นที่กด** บนมือถือต้องกว้างอย่างน้อย 36×36px (ไอคอน) และ 44×44px (ปุ่มหลัก)

---

## 7. Components

### 7.1 Button

สามชนิด:

- **Primary** `background: #170C79`, text ขาว — action หลักต่อหน้า เช่น "เพิ่มอุปกรณ์"
- **Secondary** border `#E6ECEE` + bg ขาว — action รอง เช่น "นำเข้า Excel"
- **Icon-only** 36×36px border, สี muted — action ย่อยใน topbar

ขนาด: height 36px, border-radius 6px, font-size 13px

### 7.2 Chip (status)

- Border-radius 999px (pill)
- Padding 3px × 9px, font 11.5px / weight 500
- Dot นำหน้า 6px ใช้ `currentColor` ให้สีสอดคล้อง

### 7.3 Card

- `background: #FFFFFF`
- `border: 1px solid #E6ECEE`
- `border-radius: 10px`
- Header padding 14px × 16px, body ขึ้นกับเนื้อหา

### 7.4 Table

- Row height 48-56px (padding 12 × 16)
- Header: `background: #F5F5F5`, text 11.5px muted, weight 500
- แถว hover → `background: #F5F5F5`
- เส้นแบ่งแถว 1px สี border-light
- Horizontal scroll เมื่อแคบ: `min-width: 760px`
- Action column: ชิดขวา, ปุ่ม 3-dot เปิด dropdown

### 7.5 KPI card

- พื้นสี surface, border 10px radius
- โครงสร้าง: label (12.5px muted + dot) → value (26px mono) → trend (11.5px)
- Dot สีสถานะ 8px กลม นำหน้า label เพื่อให้ scan แถวเดียวจบ

### 7.6 Input

- Height 36-40px, padding 8 × 12 (+ 24 ถ้ามีไอคอน)
- Border 1px → focus เปลี่ยนเป็น primary + box-shadow `0 0 0 3px primary-soft`
- Placeholder สี subtle

### 7.7 Alert row

- พื้น `#FEF3C7` (warning soft), border `#F3D78A`, radius 8px
- Icon + ข้อความ strong + รายละเอียด + link "ดูทั้งหมด →"
- ใช้สำหรับสรุปที่ต้องดำเนินการ ไม่ใช่ error (error ใช้ toast)

### 7.8 Pagination

- ปุ่ม 30×30px, border-radius 6px, font-mono
- Active state ใช้ primary filled

### 7.9 Sidebar nav

- Nav item 32px สูง, radius 6px, padding 7×10
- Icon 16px นำหน้า
- Active: พื้น primary-soft + ตัวอักษร primary + weight 500
- Badge count ที่ท้าย (font-mono, radius 10px)

### 7.10 Topbar

- สูง 60px, สติ๊กกี้
- Search bar กลาง (max 420px), icon buttons ขวา, avatar ขวาสุด
- Keyboard hint `⌘K` ปรากฏบน desktop เท่านั้น

---

## 8. Interaction & Motion

- Hover state: เปลี่ยนสี 100ms linear
- ไม่ใช้ animation เกินจำเป็น — ระบบงานต้องรู้สึก snappy
- Sidebar สไลด์เข้า-ออก: 200ms ease
- Respect `prefers-reduced-motion` — ปิด animation ทั้งหมดเมื่อผู้ใช้ตั้งไว้

---

## 9. Accessibility

- **Contrast** ตัวอักษรต่อพื้นต้อง ≥ 4.5:1 (WCAG AA) — ตรวจทุก token
- **Focus ring** ชัดเจน: `outline: 2px solid primary, offset 2px`
- **Status** สื่อด้วยทั้งสีและข้อความ (ไม่ใช่สีอย่างเดียว)
- **Keyboard** ทุก action ต้องเข้าถึงได้ด้วย Tab/Enter/Esc
- **ARIA** label บน icon-only button (`aria-label="สแกน QR"`)
- **Touch target** มือถือ ≥ 44×44px

---

## 10. Writing style (microcopy)

- ใช้คำที่ผู้ใช้คุ้น: "ยืม-คืน" ไม่ใช่ "transaction entry"
- ปุ่มสั่งงานด้วยกริยาตรง: "บันทึก" "อนุมัติ" "ส่งซ่อม"
- Error บอกว่าอะไรผิดและทำอย่างไรต่อ ไม่ใช่แค่ "เกิดข้อผิดพลาด"
- Date รูปแบบไทย: `15 ก.ค. 2027` (ไม่ใช่ `2027-07-15` ใน UI)
- Status: "พร้อมใช้" "ถูกยืม" "เบิกถาวร" "กำลังซ่อม" "Scrap" (เก็บ Scrap เป็นภาษาอังกฤษตามศัพท์ที่ใช้งานจริง)

---

## 11. Light-mode commitment

ระบบนี้ commit กับ light mode อย่างเดียว ไม่รองรับ dark mode เนื่องจาก:

1. ใช้งานในออฟฟิศเป็นหลัก สภาพแสงปกติ
2. ลดภาระการ maintain token 2 ชุด
3. พาเลตที่เลือก (F5F5F5 + indigo + light teal) ถูกออกแบบมาสำหรับพื้นสว่าง

หากต้องการ dark mode ในอนาคต ต้อง: (1) ปรับ primary ให้สว่างขึ้นเพื่อ contrast, (2) ลด saturation ของ #FF0000 ไม่ให้แสบตา, (3) ทบทวน chip background ทั้งหมด

---

## 12. File naming & tokens convention

หากทีมพัฒนาจะต่อยอดเป็น design system จริง แนะนำโครงสร้าง token ดังนี้:

```
color.bg.app          = #F5F5F5
color.bg.surface      = #FFFFFF
color.bg.subtle       = #F5F5F5
color.text.default    = #0F0A3D
color.text.muted      = #5B6472
color.text.subtle     = #94A3B8
color.border.default  = #E6ECEE
color.border.strong   = #BBD5DA
color.brand.primary   = #170C79
color.brand.soft      = #E5E3F3
color.status.success  = #0E6B6B
color.status.success.soft = #DFF1F1
color.status.warning  = #B45309
color.status.warning.soft = #FEF3C7
color.status.danger   = #FF0000
color.status.danger.soft = #FFE4E4
```

เลือกใช้ semantic token (`color.text.default`) มากกว่า value token (`color.indigo.900`) เพื่อให้ปรับ theme ภายหลังได้ง่าย
