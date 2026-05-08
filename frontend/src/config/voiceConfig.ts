export interface VoiceOption {
  lang: "en" | "zh"
  gender: "male" | "female"
  name: string
  id: string
}

export const VOICE_OPTIONS: VoiceOption[] = [
  // English Male
  { lang: "en", gender: "male", name: "Magnetic Man", id: "English_magnetic_voiced_man" },
  { lang: "en", gender: "male", name: "Trustworthy Man", id: "English_Trustworth_Man" },
  { lang: "en", gender: "male", name: "Gentle Man", id: "English_Gentle-voiced_man" },
  { lang: "en", gender: "male", name: "Reserved Young Man", id: "English_ReservedYoungMan" },
  { lang: "en", gender: "male", name: "Deep Voice Man", id: "English_ManWithDeepVoice" },
  // English Female
  { lang: "en", gender: "female", name: "Radiant Girl", id: "English_radiant_girl" },
  { lang: "en", gender: "female", name: "Captivating Female", id: "English_captivating_female1" },
  { lang: "en", gender: "female", name: "Upbeat Woman", id: "English_Upbeat_Woman" },
  { lang: "en", gender: "female", name: "Mature Boss", id: "English_MatureBoss" },
  { lang: "en", gender: "female", name: "Social Media Female", id: "socialmedia_female_2_v1" },
  // Chinese Male
  { lang: "zh", gender: "male", name: "洒脱青年", id: "Chinese (Mandarin)_Unrestrained_Young_Man" },
  { lang: "zh", gender: "male", name: "幽默长者", id: "Chinese (Mandarin)_Humorous_Elder" },
  { lang: "zh", gender: "male", name: "电台主播", id: "Chinese (Mandarin)_Radio_Host" },
  { lang: "zh", gender: "male", name: "戏剧讲述者", id: "Chinese_dramatic_storyteller_vv1" },
  { lang: "zh", gender: "male", name: "沙哑讲述者", id: "Chinese_gravelly_storyteller_vv2" },
  // Chinese Female
  { lang: "zh", gender: "female", name: "新闻主播", id: "Chinese (Mandarin)_News_Anchor" },
  { lang: "zh", gender: "female", name: "温暖闺蜜", id: "Chinese (Mandarin)_Warm_Bestie" },
  { lang: "zh", gender: "female", name: "清脆女孩", id: "Chinese (Mandarin)_Crisp_Girl" },
  { lang: "zh", gender: "female", name: "甜美女孩", id: "Chinese_sweet_girl_vv1" },
  { lang: "zh", gender: "female", name: "暖心阿姨", id: "Chinese (Mandarin)_Warm-HeartedAunt" },
]

const STORAGE_KEY = "tts_voice_selection"

export function detectLang(text: string): "en" | "zh" {
  const sample = text.trim().slice(0, 20)
  const cjk = /[\u4e00-\u9fff\u3400-\u4dbf]/
  let zhCount = 0
  for (const ch of sample) {
    if (cjk.test(ch)) zhCount++
  }
  return zhCount > sample.length * 0.3 ? "zh" : "en"
}

export function getVoicesByLang(lang: "en" | "zh") {
  return VOICE_OPTIONS.filter((v) => v.lang === lang)
}

export function getSavedVoiceId(lang: "en" | "zh"): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
    return saved[lang] || null
  } catch {
    return null
  }
}

export function saveVoiceId(lang: "en" | "zh", voiceId: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
    saved[lang] = voiceId
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  } catch { /* ignore */ }
}

export function resolveVoiceId(text: string): string {
  const lang = detectLang(text)
  const saved = getSavedVoiceId(lang)
  if (saved) {
    const exists = VOICE_OPTIONS.find((v) => v.id === saved && v.lang === lang)
    if (exists) return saved
  }
  const first = VOICE_OPTIONS.find((v) => v.lang === lang)
  return first?.id ?? VOICE_OPTIONS[0].id
}

export function resolveVoice(text: string): VoiceOption {
  const id = resolveVoiceId(text)
  return VOICE_OPTIONS.find((v) => v.id === id) ?? VOICE_OPTIONS[0]
}
