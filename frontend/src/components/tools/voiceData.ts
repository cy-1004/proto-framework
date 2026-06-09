export interface VoiceEntry {
  id: string
  name: string
  gender: "male" | "female" | "neutral"
}

export interface VoiceGroup {
  key: string
  label: string
  voices: VoiceEntry[]
}

export const VOICE_GROUPS: VoiceGroup[] = [
  {
    key: "zh",
    label: "普通话",
    voices: [
      // Classic short IDs
      { id: "male-qn-qingse", name: "青涩男声", gender: "male" },
      { id: "male-qn-jingying", name: "精英男声", gender: "male" },
      { id: "male-qn-badao", name: "霸道男声", gender: "male" },
      { id: "male-qn-daxuesheng", name: "大学生男声", gender: "male" },
      { id: "male-qn-qingse-jingpin", name: "青涩男声·精品", gender: "male" },
      { id: "male-qn-jingying-jingpin", name: "精英男声·精品", gender: "male" },
      { id: "male-qn-badao-jingpin", name: "霸道男声·精品", gender: "male" },
      { id: "male-qn-daxuesheng-jingpin", name: "大学生男声·精品", gender: "male" },
      { id: "female-shaonv", name: "少女音", gender: "female" },
      { id: "female-yujie", name: "御姐音", gender: "female" },
      { id: "female-chengshu", name: "成熟女声", gender: "female" },
      { id: "female-tianmei", name: "甜美女声", gender: "female" },
      { id: "female-shaonv-jingpin", name: "少女音·精品", gender: "female" },
      { id: "female-yujie-jingpin", name: "御姐音·精品", gender: "female" },
      { id: "female-chengshu-jingpin", name: "成熟女声·精品", gender: "female" },
      { id: "female-tianmei-jingpin", name: "甜美女声·精品", gender: "female" },
      // Character voices
      { id: "clever_boy", name: "聪明男孩", gender: "male" },
      { id: "cute_boy", name: "可爱男孩", gender: "male" },
      { id: "lovely_girl", name: "可爱女孩", gender: "female" },
      { id: "cartoon_pig", name: "卡通小猪", gender: "neutral" },
      { id: "bingjiao_didi", name: "冰娇弟弟", gender: "male" },
      { id: "junlang_nanyou", name: "俊朗男友", gender: "male" },
      { id: "chunzhen_xuedi", name: "纯真学弟", gender: "male" },
      { id: "lengdan_xiongzhang", name: "冷淡兄长", gender: "male" },
      { id: "badao_shaoye", name: "霸道少爷", gender: "male" },
      { id: "tianxin_xiaoling", name: "甜心小铃", gender: "female" },
      { id: "qiaopi_mengmei", name: "俏皮萌妹", gender: "female" },
      { id: "wumei_yujie", name: "妩媚御姐", gender: "female" },
      { id: "diadia_xuemei", name: "娇嗲学妹", gender: "female" },
      { id: "danya_xuejie", name: "淡雅学姐", gender: "female" },
      // Professional / descriptive voices
      { id: "Chinese (Mandarin)_Reliable_Executive", name: "可靠高管", gender: "male" },
      { id: "Chinese (Mandarin)_News_Anchor", name: "新闻主播", gender: "male" },
      { id: "Chinese (Mandarin)_Mature_Woman", name: "成熟女性", gender: "female" },
      { id: "Chinese (Mandarin)_Unrestrained_Young_Man", name: "无拘束青年", gender: "male" },
      { id: "Arrogant_Miss", name: "傲娇小姐", gender: "female" },
      { id: "Robot_Armor", name: "机甲机器人", gender: "neutral" },
      { id: "Chinese (Mandarin)_Kind-hearted_Antie", name: "善良阿姨", gender: "female" },
      { id: "Chinese (Mandarin)_HK_Flight_Attendant", name: "港式空乘", gender: "female" },
      { id: "Chinese (Mandarin)_Humorous_Elder", name: "幽默老者", gender: "male" },
      { id: "Chinese (Mandarin)_Gentleman", name: "绅士", gender: "male" },
      { id: "Chinese (Mandarin)_Warm_Bestie", name: "温暖闺蜜", gender: "female" },
      { id: "Chinese (Mandarin)_Male_Announcer", name: "男播音员", gender: "male" },
      { id: "Chinese (Mandarin)_Sweet_Lady", name: "甜蜜女士", gender: "female" },
      { id: "Chinese (Mandarin)_Southern_Young_Man", name: "南方年轻男", gender: "male" },
      { id: "Chinese (Mandarin)_Wise_Women", name: "睿智女性", gender: "female" },
      { id: "Chinese (Mandarin)_Gentle_Youth", name: "温柔青年", gender: "male" },
      { id: "Chinese (Mandarin)_Warm_Girl", name: "温暖女孩", gender: "female" },
      { id: "Chinese (Mandarin)_Kind-hearted_Elder", name: "善良老者", gender: "male" },
      { id: "Chinese (Mandarin)_Cute_Spirit", name: "可爱精灵", gender: "female" },
      { id: "Chinese (Mandarin)_Radio_Host", name: "电台主持", gender: "male" },
      { id: "Chinese (Mandarin)_Lyrical_Voice", name: "抒情嗓音", gender: "male" },
      { id: "Chinese (Mandarin)_Straightforward_Boy", name: "直爽男孩", gender: "male" },
      { id: "Chinese (Mandarin)_Sincere_Adult", name: "真诚成年人", gender: "male" },
      { id: "Chinese (Mandarin)_Gentle_Senior", name: "温柔长者", gender: "male" },
      { id: "Chinese (Mandarin)_Stubborn_Friend", name: "固执朋友", gender: "male" },
      { id: "Chinese (Mandarin)_Crisp_Girl", name: "清脆女孩", gender: "female" },
      { id: "Chinese (Mandarin)_Pure-hearted_Boy", name: "纯心男孩", gender: "male" },
      { id: "Chinese (Mandarin)_Soft_Girl", name: "温柔女孩", gender: "female" },
    ],
  },
  {
    key: "yue",
    label: "粤语",
    voices: [
      { id: "Cantonese_ProfessionalHost（F)", name: "专业主持 (女)", gender: "female" },
      { id: "Cantonese_GentleLady", name: "温柔女士", gender: "female" },
      { id: "Cantonese_ProfessionalHost（M)", name: "专业主持 (男)", gender: "male" },
      { id: "Cantonese_PlayfulMan", name: "活泼男声", gender: "male" },
      { id: "Cantonese_CuteGirl", name: "可爱女孩", gender: "female" },
      { id: "Cantonese_KindWoman", name: "亲切女声", gender: "female" },
    ],
  },
  {
    key: "en",
    label: "English",
    voices: [
      { id: "Santa_Claus", name: "Santa Claus", gender: "male" },
      { id: "Grinch", name: "Grinch", gender: "male" },
      { id: "Rudolph", name: "Rudolph", gender: "neutral" },
      { id: "Arnold", name: "Arnold", gender: "male" },
      { id: "Charming_Santa", name: "Charming Santa", gender: "male" },
      { id: "Charming_Lady", name: "Charming Lady", gender: "female" },
      { id: "Sweet_Girl", name: "Sweet Girl", gender: "female" },
      { id: "Cute_Elf", name: "Cute Elf", gender: "neutral" },
      { id: "Attractive_Girl", name: "Attractive Girl", gender: "female" },
      { id: "Serene_Woman", name: "Serene Woman", gender: "female" },
      { id: "English_Trustworthy_Man", name: "Trustworthy Man", gender: "male" },
      { id: "English_Graceful_Lady", name: "Graceful Lady", gender: "female" },
      { id: "English_Aussie_Bloke", name: "Aussie Bloke", gender: "male" },
      { id: "English_Whispering_girl", name: "Whispering Girl", gender: "female" },
      { id: "English_Diligent_Man", name: "Diligent Man", gender: "male" },
      { id: "English_Gentle-voiced_man", name: "Gentle-voiced Man", gender: "male" },
    ],
  },
]

export const EMOTION_OPTIONS = [
  { value: "neutral",   label: "中性",   emoji: "😐" },
  { value: "happy",     label: "高兴",   emoji: "😄" },
  { value: "sad",       label: "悲伤",   emoji: "😢" },
  { value: "angry",     label: "愤怒",   emoji: "😠" },
  { value: "fearful",   label: "恐惧",   emoji: "😨" },
  { value: "disgusted", label: "厌恶",   emoji: "🤢" },
  { value: "surprised", label: "惊讶",   emoji: "😲" },
  { value: "calm",      label: "平静",   emoji: "😌" },
  { value: "excited",   label: "兴奋",   emoji: "🤩" },
  { value: "serious",   label: "严肃",   emoji: "🧐" },
  { value: "depressed", label: "沮丧",   emoji: "😞" },
]

export function findVoice(id: string): VoiceEntry | undefined {
  for (const g of VOICE_GROUPS) {
    const v = g.voices.find(v => v.id === id)
    if (v) return v
  }
  return undefined
}
