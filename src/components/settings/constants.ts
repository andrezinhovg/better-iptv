// Language options with ISO codes for MPV
export const LANGUAGE_OPTIONS = [
  { code: 'none', name: 'None (Original)', iso: '' },
  { code: 'sv', name: 'Svenska (Swedish)', iso: 'sv,swe,se' },
  { code: 'en', name: 'English', iso: 'en,eng' },
  { code: 'no', name: 'Norsk (Norwegian)', iso: 'no,nor,nb,nn' },
  { code: 'da', name: 'Dansk (Danish)', iso: 'da,dan' },
  { code: 'fi', name: 'Suomi (Finnish)', iso: 'fi,fin' },
  { code: 'de', name: 'Deutsch (German)', iso: 'de,deu,ger' },
  { code: 'fr', name: 'Francais (French)', iso: 'fr,fra,fre' },
  { code: 'es', name: 'Espanol (Spanish)', iso: 'es,spa' },
  { code: 'it', name: 'Italiano (Italian)', iso: 'it,ita' },
  { code: 'pt', name: 'Portugues (Portugal)', iso: 'pt,por' },
  { code: 'pt-BR', name: 'Portugues (Brasil)', iso: 'pt-br,pob,por' },
  { code: 'nl', name: 'Nederlands (Dutch)', iso: 'nl,nld,dut' },
  { code: 'pl', name: 'Polski (Polish)', iso: 'pl,pol' },
  { code: 'ru', name: 'Russkij (Russian)', iso: 'ru,rus' },
  { code: 'ar', name: 'Al-Arabiya (Arabic)', iso: 'ar,ara' },
  { code: 'tr', name: 'Turkce (Turkish)', iso: 'tr,tur' },
  { code: 'ja', name: 'Nihongo (Japanese)', iso: 'ja,jpn' },
  { code: 'zh', name: 'Zhongwen (Chinese)', iso: 'zh,chi,zho' },
  { code: 'ko', name: 'Hangugeo (Korean)', iso: 'ko,kor' },
] as const;

export const USER_AGENT_OPTIONS = [
  { mode: 'default', label: 'Default (Better-IP-TV)' },
  { mode: 'tivimate', label: 'TiviMate' },
  { mode: 'vlc', label: 'VLC' },
  { mode: 'custom', label: 'Custom' },
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]['code'];
export type UserAgentMode = (typeof USER_AGENT_OPTIONS)[number]['mode'];
export type Theme = 'light' | 'dark' | 'system';
export type ParentalVisibility = 'hide' | 'lock' | 'blur';
