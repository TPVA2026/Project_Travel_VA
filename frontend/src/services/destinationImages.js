// Landscape photos for every supported destination, served lazily from /images/destinations/
// so cold load only requests the destination image actually rendered on screen.
const anGiang = '/images/destinations/AnGiang.jpg'
const bacNinh = '/images/destinations/BacNinh.jpg'
const caMau = '/images/destinations/CaMau.jpg'
const canTho = '/images/destinations/CanTho.jpg'
const caoBang = '/images/destinations/CaoBang.jpg'
const daNang = '/images/destinations/DaNang.jpg'
const dakLak = '/images/destinations/DakLak.jpg'
const dienBien = '/images/destinations/DienBien.jpg'
const dongNai = '/images/destinations/DongNai.jpg'
const dongThap = '/images/destinations/DongThap.jpg'
const giaLai = '/images/destinations/GiaLai.jpg'
const haNoi = '/images/destinations/HaNoi.jpg'
const haTinh = '/images/destinations/HaTinh.jpg'
const haiPhong = '/images/destinations/HaiPhong.jpg'
const hue = '/images/destinations/Hue.jpg'
const hungYen = '/images/destinations/HungYen.jpg'
const khanhHoa = '/images/destinations/KhanhHoa.jpg'
const laiChau = '/images/destinations/LaiChau.jpg'
const lamDong = '/images/destinations/LamDong.jpg'
const langSon = '/images/destinations/LangSon.jpg'
const laoCai = '/images/destinations/LaoCai.jpg'
const ngheAn = '/images/destinations/NgheAn.jpg'
const ninhBinh = '/images/destinations/NinhBinh.jpg'
const phuTho = '/images/destinations/PhuTho.jpg'
const quangNgai = '/images/destinations/QuangNgai.jpg'
const quangNinh = '/images/destinations/QuangNinh.jpg'
const quangTri = '/images/destinations/QuangTri.jpg'
const sonLa = '/images/destinations/SonLa.jpg'
const tayNinh = '/images/destinations/TayNinh.jpg'
const thaiNguyen = '/images/destinations/ThaiNguyen.jpg'
const thanhHoa = '/images/destinations/ThanhHoa.jpg'
const tpHoChiMinh = '/images/destinations/TpHoChiMinh.jpg'
const tuyenQuang = '/images/destinations/TuyenQuang.jpg'
const vinhLong = '/images/destinations/VinhLong.jpg'

// Province code (Vietnamese Provinces Database v5.2.0) -> bundled landscape.
const BY_PROVINCE_CODE = {
  '01': haNoi,
  '04': caoBang,
  '08': tuyenQuang,
  '11': dienBien,
  '12': laiChau,
  '14': sonLa,
  '15': laoCai,
  '19': thaiNguyen,
  '20': langSon,
  '22': quangNinh,
  '24': bacNinh,
  '25': phuTho,
  '31': haiPhong,
  '33': hungYen,
  '37': ninhBinh,
  '38': thanhHoa,
  '40': ngheAn,
  '42': haTinh,
  '44': quangTri,
  '46': hue,
  '48': daNang,
  '51': quangNgai,
  '52': giaLai,
  '56': khanhHoa,
  '66': dakLak,
  '68': lamDong,
  '75': dongNai,
  '79': tpHoChiMinh,
  '80': tayNinh,
  '82': dongThap,
  '86': vinhLong,
  '91': anGiang,
  '92': canTho,
  '96': caMau,
}

// Destination ids used by the backend/legacy datasets that are not "VN_<code>".
const BY_DESTINATION_ID = {
  H: hue,
  NT: khanhHoa,
  HCM: tpHoChiMinh,
}

// Canonical Vietnamese display name for each province code.
const NAME_BY_PROVINCE_CODE = {
  '01': 'Hà Nội',
  '04': 'Cao Bằng',
  '08': 'Tuyên Quang',
  '11': 'Điện Biên',
  '12': 'Lai Châu',
  '14': 'Sơn La',
  '15': 'Lào Cai',
  '19': 'Thái Nguyên',
  '20': 'Lạng Sơn',
  '22': 'Quảng Ninh',
  '24': 'Bắc Ninh',
  '25': 'Phú Thọ',
  '31': 'Hải Phòng',
  '33': 'Hưng Yên',
  '37': 'Ninh Bình',
  '38': 'Thanh Hoá',
  '40': 'Nghệ An',
  '42': 'Hà Tĩnh',
  '44': 'Quảng Trị',
  '46': 'Huế',
  '48': 'Đà Nẵng',
  '51': 'Quảng Ngãi',
  '52': 'Gia Lai',
  '56': 'Khánh Hoà',
  '66': 'Đắk Lắk',
  '68': 'Lâm Đồng',
  '75': 'Đồng Nai',
  '79': 'Hồ Chí Minh',
  '80': 'Tây Ninh',
  '82': 'Đồng Tháp',
  '86': 'Vĩnh Long',
  '91': 'An Giang',
  '92': 'Cần Thơ',
  '96': 'Cà Mau',
}

const LEGACY_CODE_BY_ID = { H: '46', NT: '56', HCM: '79' }

const EXTRA_ALIASES = {
  '79': ['TP HCM', 'TPHCM', 'Sai Gon', 'Saigon', 'Ho Chi Minh City', 'Thanh pho Ho Chi Minh'],
  '46': ['Thua Thien Hue', 'Hue City'],
  '01': ['Ha Noi', 'Hanoi'],
  '56': ['Nha Trang', 'Khanh Hoa'],
  '68': ['Da Lat', 'Dalat'],
  '31': ['Hai Phong', 'Haiphong'],
}

export function foldDestinationText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const MATCHERS = []
for (const [code, image] of Object.entries(BY_PROVINCE_CODE)) {
  const name = NAME_BY_PROVINCE_CODE[code]
  const aliases = [name, ...(EXTRA_ALIASES[code] || [])]
  for (const alias of aliases) {
    MATCHERS.push({ key: foldDestinationText(alias), image, name })
  }
}
MATCHERS.sort((left, right) => right.key.length - left.key.length)

function provinceCodeFromId(value) {
  const text = String(value ?? '').trim()
  if (LEGACY_CODE_BY_ID[text.toUpperCase()]) return LEGACY_CODE_BY_ID[text.toUpperCase()]
  const match = text.match(/^VN[_-]?(\d{2,3})$/i)
  return match ? match[1].padStart(2, '0') : null
}

function matchValue(value) {
  if (value == null) return null
  if (typeof value === 'object') {
    return matchValue(value.destinationId) || matchValue(value.destination) || matchValue(value.city)
  }
  const text = String(value).trim()
  if (!text) return null

  const code = provinceCodeFromId(text)
  if (code && BY_PROVINCE_CODE[code]) {
    return { image: BY_PROVINCE_CODE[code], name: NAME_BY_PROVINCE_CODE[code] }
  }
  const exactId = BY_DESTINATION_ID[text.toUpperCase()]
  if (exactId) {
    return {
      image: exactId,
      name: NAME_BY_PROVINCE_CODE[LEGACY_CODE_BY_ID[text.toUpperCase()]],
    }
  }

  const folded = foldDestinationText(text)
  if (!folded) return null
  const exact = MATCHERS.find((entry) => entry.key === folded)
  if (exact) return exact
  const contained = MATCHERS.find((entry) =>
    folded === entry.key ||
    folded.startsWith(`${entry.key} `) ||
    folded.endsWith(` ${entry.key}`) ||
    folded.includes(` ${entry.key} `)
  )
  return contained || null
}

function firstMatch(values) {
  for (const value of values) {
    const match = matchValue(value)
    if (match) return match
  }
  return null
}

/**
 * Resolve a bundled destination photo from any mix of destination id, city
 * name or itinerary title. Returns null when nothing matches, so callers can
 * keep a neutral placeholder instead of guessing an image.
 */
export function getDestinationImage(...values) {
  return firstMatch(values)?.image || null
}

/**
 * Canonical Vietnamese destination name for a plan. Falls back to null so the
 * caller can keep showing the raw id, never a guessed city.
 */
export function getDestinationLabel(...values) {
  return firstMatch(values)?.name || null
}

export function getDestinationMedia(...values) {
  return firstMatch(values) || null
}
