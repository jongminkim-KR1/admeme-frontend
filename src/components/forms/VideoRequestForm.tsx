'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { PRODUCT_CATEGORIES } from '@/lib/constants'
import { memeApi, characterProfilesApi, videoApi, type Meme, type CharacterProfile } from '@/lib/api'
import { CharacterStyleTips } from './CharacterStyleTips'
import { FileDropzone } from './FileDropzone'
import { useToast } from '@/components/ui/Toast'

type FormData = {
  productName: string
  productCategory: string
  customCategory?: string
  productHighlight: string
  memeId: string
  characterImagePrompt: string
  productImage: File | null
  productUrl: string
  characterVoicePrompt: string
}

const CHARACTER_PROFILES = [
  {
    id: 'friendly-20s-female',
    name: '친근한 20대 여성',
    subtitle: '밝고 친근한 분위기',
    emoji: '😊',
    appearance: '20대 초반 여성, 밝은 미소, 자연스러운 메이크업, 캐주얼한 스타일',
    voice: '밝고 친근한 톤, 귀여운 말투, 부드럽고 경쾌한 목소리',
    fullDescription: '20대 초반 여성, 밝은 미소, 자연스러운 메이크업, 캐주얼한 스타일. 밝고 친근한 톤, 귀여운 말투, 부드럽고 경쾌한 목소리.'
  },
  {
    id: 'professional-30s-male',
    name: '전문적인 30대 남성',
    subtitle: '신뢰감 있는 전문가',
    emoji: '👔',
    appearance: '30대 중반 남성, 단정한 헤어스타일, 깔끔한 정장 스타일',
    voice: '신뢰감 있는 차분한 목소리, 명확한 발음, 안정적인 톤',
    fullDescription: '30대 중반 남성, 단정한 헤어스타일, 깔끔한 정장 스타일. 신뢰감 있는 차분한 목소리, 명확한 발음, 안정적인 톤.'
  },
  {
    id: 'energetic-rabbit',
    name: '발랄한 토끼 캐릭터',
    subtitle: '귀엽고 생기 넘치는',
    emoji: '🐰',
    appearance: '토끼 콘셉트의 캐릭터, 밝고 친근한 인상, 사람과 유사한 제스처와 행동',
    voice: '활기차고 에너지 넘치는 목소리, 빠른 템포, 밝은 톤',
    fullDescription: '토끼 콘셉트의 캐릭터, 밝고 친근한 인상, 사람과 유사한 제스처와 행동. 활기차고 에너지 넘치는 목소리, 빠른 템포, 밝은 톤.'
  }
]

export function VideoRequestForm({ onSubmit, onCancel }: { onSubmit: (data: FormData) => void; onCancel: () => void }) {
  const [showTips, setShowTips] = useState(false)
  const [memes, setMemes] = useState<Meme[]>([])
  const [memesLoading, setMemesLoading] = useState(true)
  const [memeDropdownOpen, setMemeDropdownOpen] = useState(false)
  const [memeSearch, setMemeSearch] = useState('')
  const [characterProfiles, setCharacterProfiles] = useState<CharacterProfile[]>([])
  const [selectedProfile, setSelectedProfile] = useState<CharacterProfile | null>(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const memeDropdownRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const { showToast } = useToast()

  useEffect(() => {
    async function fetchMemes() {
      try {
        const response = await memeApi.getMemes({ limit: 200 })
        setMemes(response.memes)
      } catch (error) {
        console.error('Failed to load memes:', error)
      } finally {
        setMemesLoading(false)
      }
    }
    fetchMemes()
  }, [])

  useEffect(() => {
    async function fetchProfiles() {
      try {
        const profiles = await characterProfilesApi.getProfiles()
        console.log('Fetched profiles:', profiles)
        setCharacterProfiles(profiles)
      } catch (error) {
        console.error('Failed to load character profiles:', error)
      }
    }
    fetchProfiles()
  }, [])

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (memeDropdownRef.current && !memeDropdownRef.current.contains(e.target as Node)) {
        setMemeDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredMemes = memes.filter(m =>
    m.meme_name.toLowerCase().includes(memeSearch.toLowerCase())
  )

  const handleSuggestPrompts = async () => {
    const values = getValues()
    const productName = values.productName?.trim()
    const productCategory = values.productCategory?.trim()
    const productHighlight = values.productHighlight?.trim()

    if (!productName) {
      setError('productName', { message: 'Please enter a product name' })
      return
    }
    if (!productCategory) {
      setError('productCategory', { message: 'Please select a category' })
      return
    }
    if (!productHighlight) {
      setError('productHighlight', { message: 'Please enter a product description' })
      return
    }

    const finalCategory = productCategory === '기타' && values.customCategory
      ? values.customCategory
      : productCategory

    setIsSuggesting(true)
    try {
      const result = await videoApi.suggestCharacterPrompts({
        product_name: productName,
        product_category: finalCategory,
        product_description: productHighlight,
      })

      if (result.character_image_prompt) {
        setValue('characterImagePrompt', result.character_image_prompt, { shouldValidate: true })
        clearErrors('characterImagePrompt')
      }
      if (result.character_voice_prompt) {
        setValue('characterVoicePrompt', result.character_voice_prompt)
      }
      showToast('Prompts generated.', 'success')
    } catch (error) {
      console.error('Failed to suggest prompts:', error)
      showToast('Failed to generate prompts.', 'error')
    } finally {
      setIsSuggesting(false)
    }
  }

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      productImage: null,
      productUrl: '',
      characterVoicePrompt: '',
    },
  })

  const watchedProductName = watch('productName')
  const watchedProductCategory = watch('productCategory')
  const watchedCustomCategory = watch('customCategory')
  const watchedProductHighlight = watch('productHighlight')
  const canSuggestPrompts = Boolean(watchedProductName?.trim())
    && Boolean((watchedProductCategory === '기타' ? watchedCustomCategory : watchedProductCategory)?.trim())
    && Boolean(watchedProductHighlight?.trim())

  const productImage = watch('productImage')

  const onSubmitWithImageCheck = (data: FormData) => {
    if (!data.productImage) {
      setError('productImage', { message: '제품 이미지를 업로드하세요' })
      return
    }
    onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmitWithImageCheck)} className="space-y-8">
      {/* 제품 기본 정보 */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[var(--gradient-1)]/10 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--gradient-1)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">제품 정보</h3>
            <p className="text-sm text-[#888]">광고할 제품의 정보를 입력하세요</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="productName" className="block text-sm font-medium text-white mb-2">
              제품명 <span className="text-[var(--gradient-1)]">*</span>
            </label>
            <input
              id="productName"
              type="text"
              {...register('productName', { required: '제품명을 입력하세요' })}
              className={`w-full px-4 py-3 bg-[#0a0a0a] border rounded-xl text-white placeholder-[#555] focus:outline-none focus:ring-1 transition-all ${
                errors.productName
                  ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                  : 'border-[#1a1a1a] focus:border-[var(--gradient-1)]/50 focus:ring-[var(--gradient-1)]/20'
              }`}
              placeholder="제품명을 입력하세요"
            />
            {errors.productName && (
              <p className="mt-2 text-sm text-red-400">{errors.productName.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="productCategory" className="block text-sm font-medium text-white mb-2">
              제품 카테고리 <span className="text-[var(--gradient-1)]">*</span>
            </label>
            <select
              id="productCategory"
              {...register('productCategory', { required: '카테고리를 선택하세요' })}
              className={`w-full px-4 py-3 bg-[#0a0a0a] border rounded-xl text-white focus:outline-none focus:ring-1 transition-all appearance-none cursor-pointer ${
                errors.productCategory
                  ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                  : 'border-[#1a1a1a] focus:border-[var(--gradient-1)]/50 focus:ring-[var(--gradient-1)]/20'
              }`}
            >
              <option value="" className="bg-[#141414]">선택하세요</option>
              {PRODUCT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="bg-[#141414]">
                  {cat}
                </option>
              ))}
            </select>
            {errors.productCategory && (
              <p className="mt-2 text-sm text-red-400">{errors.productCategory.message}</p>
            )}
          </div>

          {watch('productCategory') === '기타' && (
            <div>
              <label htmlFor="customCategory" className="block text-sm font-medium text-white mb-2">
                카테고리 직접 입력 <span className="text-[var(--gradient-1)]">*</span>
              </label>
              <input
                id="customCategory"
                type="text"
                {...register('customCategory', { 
                  required: watch('productCategory') === '기타' ? '카테고리를 입력하세요' : false 
                })}
                className={`w-full px-4 py-3 bg-[#0a0a0a] border rounded-xl text-white placeholder-[#555] focus:outline-none focus:ring-1 transition-all ${
                  errors.customCategory
                    ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                    : 'border-[#1a1a1a] focus:border-[var(--gradient-1)]/50 focus:ring-[var(--gradient-1)]/20'
                }`}
                placeholder="카테고리를 입력하세요"
              />
              {errors.customCategory && (
                <p className="mt-2 text-sm text-red-400">{errors.customCategory.message}</p>
              )}
            </div>
          )}

          <div className="md:col-span-2">
            <label htmlFor="productHighlight" className="block text-sm font-medium text-white mb-2">
              제품 설명 <span className="text-[var(--gradient-1)]">*</span>
            </label>
            <textarea
              id="productHighlight"
              {...register('productHighlight', { required: '제품 설명을 입력하세요', maxLength: { value: 500, message: '500자 이하로 입력하세요' } })}
              rows={4}
              maxLength={500}
              placeholder={"제품의 특징, 장점, 사용 용도 등을 자유롭게 설명해주세요\n예시: 100% 유기농 원료로 만든 저자극 스킨케어 제품입니다. 민감한 피부에도 안심하고 사용할 수 있으며, 24시간 지속되는 보습력이 특징입니다."}
              className={`w-full px-4 py-3 bg-[#0a0a0a] border rounded-xl text-white placeholder-[#555] focus:outline-none focus:ring-1 transition-all resize-none ${
                errors.productHighlight
                  ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                  : 'border-[#1a1a1a] focus:border-[var(--gradient-1)]/50 focus:ring-[var(--gradient-1)]/20'
              }`}
            />
            <div className="flex justify-between mt-1">
              {errors.productHighlight ? (
                <p className="text-sm text-red-400">{errors.productHighlight.message}</p>
              ) : (
                <span />
              )}
              <span className="text-xs text-[#555]">{watch('productHighlight')?.length || 0}/500</span>
            </div>
          </div>

          <div className="md:col-span-2 mt-3">
            <label htmlFor="productUrl" className="block text-sm font-medium text-white mb-2">제품 URL</label>
            <input
              id="productUrl"
              type="url"
              {...register('productUrl', {
                pattern: {
                  value: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
                  message: '올바른 URL 형식이 아닙니다'
                }
              })}
              placeholder="https://..."
              className={`w-full px-4 py-3 bg-[#0a0a0a] border rounded-xl text-white placeholder-[#555] focus:outline-none focus:ring-1 transition-all ${
                errors.productUrl
                  ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                  : 'border-[#1a1a1a] focus:border-[var(--gradient-1)]/50 focus:ring-[var(--gradient-1)]/20'
              }`}
            />
            {errors.productUrl && (
              <p className="mt-2 text-sm text-red-400">{errors.productUrl.message}</p>
            )}
          </div>
        </div>
      </section>

      {/* 제품 이미지 */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#a855f7]/10 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-[#a855f7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">제품 이미지 <span className="text-[var(--gradient-1)]">*</span></h3>
            <p className="text-sm text-[#888]">영상에 사용할 제품 이미지를 업로드하세요</p>
          </div>
        </div>

        <FileDropzone
          label="제품 이미지"
          accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
          value={productImage}
          onChange={(f) => { setValue('productImage', f); if (f) clearErrors('productImage') }}
          required
          hint="고해상도 이미지 권장 (PNG, JPG, WEBP, 최대 10MB)"
        />
        {errors.productImage && (
          <p className="mt-2 text-sm text-red-400">{errors.productImage.message}</p>
        )}
      </section>

      {/* 밈 선택 */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[var(--gradient-1)]/10 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--gradient-1)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">밈 선택 <span className="text-[var(--gradient-1)]">*</span></h3>
            <p className="text-sm text-[#888]">영상에 사용할 밈 스타일을 선택하세요</p>
          </div>
        </div>

        <input type="hidden" {...register('memeId', { required: '밈을 선택하세요' })} />
        <div ref={memeDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => !memesLoading && setMemeDropdownOpen(!memeDropdownOpen)}
            disabled={memesLoading}
            className={`w-full px-4 py-3 bg-[#0a0a0a] border rounded-xl text-left text-white focus:outline-none focus:ring-1 transition-all disabled:opacity-50 flex items-center justify-between ${
              errors.memeId
                ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                : 'border-[#1a1a1a] focus:border-[var(--gradient-1)]/50 focus:ring-[var(--gradient-1)]/20'
            }`}
          >
            <span className={watch('memeId') ? 'text-white' : 'text-[#555]'}>
              {memesLoading
                ? '밈 로딩 중...'
                : watch('memeId')
                  ? memes.find(m => String(m.meme_id) === watch('memeId'))?.meme_name
                  : '밈을 선택하세요'}
            </span>
            <svg className={`w-5 h-5 text-[#555] transition-transform ${memeDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {memeDropdownOpen && (
            <div className="absolute z-50 w-full mt-2 bg-[#141414] border border-[#2a2a2a] rounded-xl shadow-xl overflow-hidden">
              <div className="p-2 border-b border-[#2a2a2a]">
                <input
                  type="text"
                  placeholder="밈 검색..."
                  value={memeSearch}
                  onChange={(e) => setMemeSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white placeholder-[#555] focus:outline-none focus:border-[var(--gradient-1)]/50 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="max-h-72 overflow-y-auto">
                {filteredMemes.length === 0 ? (
                  <div className="px-4 py-3 text-[#555] text-sm">검색 결과가 없습니다</div>
                ) : (
                  filteredMemes.map((meme) => (
                    <button
                      key={meme.meme_id}
                      type="button"
                      onClick={() => {
                        setValue('memeId', String(meme.meme_id))
                        setMemeDropdownOpen(false)
                        setMemeSearch('')
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-[#1a1a1a] transition-colors border-b border-[#1a1a1a] last:border-b-0 ${
                        watch('memeId') === String(meme.meme_id)
                          ? 'bg-[var(--gradient-1)]/10'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-medium ${watch('memeId') === String(meme.meme_id) ? 'text-[var(--gradient-1)]' : 'text-white'}`}>
                          {meme.meme_name}
                        </span>
                        <span className="text-xs text-[#666]">{meme.usage_count}회 사용</span>
                      </div>
                      {meme.description && (
                        <p className="text-xs text-[#888] line-clamp-2">{meme.description}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        {errors.memeId && (
          <p className="mt-2 text-sm text-red-400">{errors.memeId.message}</p>
        )}
        {!memesLoading && memes.length === 0 && (
          <p className="mt-2 text-sm text-yellow-400">사용 가능한 밈이 없습니다</p>
        )}
      </section>

      {/* 캐릭터 스타일 */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--gradient-3)]/10 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--gradient-3)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">캐릭터 스타일 <span className="text-[var(--gradient-1)]">*</span></h3>
              <p className="text-sm text-[#888]">프로필을 선택하거나 원하는 캐릭터 스타일을 직접 입력하세요</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowTips(!showTips)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              showTips
                ? 'bg-[var(--gradient-3)]/10 text-[var(--gradient-3)]'
                : 'text-[#888] hover:text-[var(--gradient-3)] hover:bg-[var(--gradient-3)]/5'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            작성 팁
          </button>
        </div>

        <CharacterStyleTips isOpen={showTips} onClose={() => setShowTips(false)} />

        {/* 캐릭터 프로필 선택 */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-white mb-3">추천 프로필 (클릭하여 샘플 확인)</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(characterProfiles || []).map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => {
                  setSelectedProfile(profile)
                  setProfileModalOpen(true)
                }}
                className="p-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl text-left hover:border-[var(--gradient-3)]/50 hover:bg-[#141414] transition-all group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 bg-[var(--gradient-3)]/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--gradient-3)]/20 transition-colors">
                    <span className="text-2xl">{profile.emoji}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="text-sm font-semibold text-white mb-1 group-hover:text-[var(--gradient-3)] transition-colors">
                      {profile.name}
                    </h5>
                    <p className="text-xs text-[#666]">{profile.subtitle}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-[#888]">외형:</span>
                    <p className="text-xs text-[#aaa] mt-0.5 line-clamp-2">{profile.appearance}</p>
                  </div>
                  <div>
                    <span className="text-xs text-[#888]">목소리:</span>
                    <p className="text-xs text-[#aaa] mt-0.5 line-clamp-2">{profile.voice}</p>
                  </div>
                </div>
                <div className="mt-3 text-xs text-[var(--gradient-3)] flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  샘플 보기
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={showTips ? 'mt-4' : ''}>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="characterImagePrompt" className="block text-sm font-medium text-white">
              Image prompt
            </label>
            <button
              type="button"
              onClick={handleSuggestPrompts}
              disabled={!canSuggestPrompts || isSuggesting}
              className="px-3 py-1.5 text-xs rounded-md border border-[#1a1a1a] text-white hover:border-[var(--gradient-1)]/50 hover:text-[var(--gradient-1)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSuggesting ? 'Generating...' : 'Generate prompts'}
            </button>
          </div>
          <textarea
            id="characterImagePrompt"
            {...register('characterImagePrompt', { required: '캐릭터 스타일을 입력하세요', maxLength: { value: 500, message: '500자 이하로 입력하세요' } })}
            rows={4}
            maxLength={500}
            placeholder="예: 밝고 친근한 20대 캐릭터, 캐주얼 복장, 3D 스타일"
            className={`w-full px-4 py-3 bg-[#0a0a0a] border rounded-xl text-white placeholder-[#555] focus:outline-none focus:ring-1 transition-all resize-none ${
              errors.characterImagePrompt
                ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                : 'border-[#1a1a1a] focus:border-[var(--gradient-1)]/50 focus:ring-[var(--gradient-1)]/20'
            }`}
          />
          <div className="flex justify-between mt-2">
            {errors.characterImagePrompt ? (
              <p className="text-sm text-red-400">{errors.characterImagePrompt.message}</p>
            ) : (
              <span />
            )}
            <span className="text-xs text-[#555]">{watch('characterImagePrompt')?.length || 0}/500</span>
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="characterVoicePrompt" className="block text-sm font-medium text-white mb-2">Voice prompt</label>
          <textarea
            id="characterVoicePrompt"
            {...register('characterVoicePrompt', { maxLength: { value: 500, message: '500자 이하로 입력하세요' } })}
            rows={4}
            maxLength={500}
            placeholder="예: 30대 여성, 맑고 부드러운 음색, 차분한 톤, 대화 속도는 보통"
            className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl text-white placeholder-[#555] focus:outline-none focus:border-[var(--gradient-1)]/50 focus:ring-1 focus:ring-[var(--gradient-1)]/20 transition-all resize-none"
          />
          <div className="flex justify-end mt-2">
            <span className="text-xs text-[#555]">{watch('characterVoicePrompt')?.length || 0}/500</span>
          </div>
          <p className="text-xs text-[#555] mt-2">AI가 이 설명을 바탕으로 캐릭터 이미지와 음성을 생성합니다</p>
        </div>
      </section>

      {/* Actions */}
      <div className="flex justify-end gap-4 pt-6 border-t border-[#1a1a1a]">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 bg-[#1a1a1a] text-white font-medium rounded-lg hover:bg-[#2a2a2a] transition-colors"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2.5 btn-primary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              처리 중...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              제작 요청
            </>
          )}
        </button>
      </div>

      {/* 캐릭터 프로필 모달 */}
      {profileModalOpen && selectedProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setProfileModalOpen(false)}>
          <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div className="sticky top-0 bg-[#0a0a0a] border-b border-[#2a2a2a] p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[var(--gradient-3)]/10 rounded-xl flex items-center justify-center">
                  <span className="text-3xl">{selectedProfile.emoji}</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedProfile.name}</h3>
                  <p className="text-sm text-[#888]">{selectedProfile.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#1a1a1a] transition-colors text-[#888] hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="p-6 space-y-6">
              {/* 캐릭터 이미지 */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3">캐릭터 이미지</h4>
                <div className="relative rounded-xl overflow-hidden bg-[#141414] border border-[#2a2a2a]">
                  <img
                    src={`http://localhost:8000${selectedProfile.image_url}`}
                    alt={selectedProfile.name}
                    className="w-full h-auto object-contain max-h-[400px]"
                    onError={(e) => {
                      e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23141414" width="400" height="400"/%3E%3Ctext fill="%23666" font-family="sans-serif" font-size="18" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3E이미지 로드 실패%3C/text%3E%3C/svg%3E'
                    }}
                  />
                </div>
              </div>

              {/* 음성 샘플 */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3">음성 샘플</h4>
                <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
                  <audio
                    ref={audioRef}
                    src={`http://localhost:8000${selectedProfile.audio_url}`}
                    controls
                    className="w-full"
                    style={{ height: '40px' }}
                  />
                </div>
              </div>

              {/* 상세 설명 */}
              <div className="space-y-3">
                <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
                  <h5 className="text-xs font-medium text-[#888] mb-2">외형</h5>
                  <p className="text-sm text-white">{selectedProfile.appearance}</p>
                </div>
                <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
                  <h5 className="text-xs font-medium text-[#888] mb-2">목소리</h5>
                  <p className="text-sm text-white">{selectedProfile.voice}</p>
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-[#1a1a1a] text-white font-medium rounded-lg hover:bg-[#2a2a2a] transition-colors"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setValue('characterImagePrompt', selectedProfile.full_description)
                    clearErrors('characterImagePrompt')
                    setProfileModalOpen(false)
                  }}
                  className="flex-1 px-4 py-3 btn-primary rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  이 프로필 사용하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
