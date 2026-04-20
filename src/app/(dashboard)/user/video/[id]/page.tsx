'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  videoApi,
  scenarioApi,
  finalApi,
  clientAnalyticsApi
} from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { useGeneration } from '@/contexts/GenerationContext'
import { STATUS_CONFIG_WITH_BORDER } from '@/lib/constants'
import type { Video, VideoMetrics, ScenarioVersion } from '@/types'

const progressSteps = [
  { key: 'pending', label: '정보 입력' },
  { key: 'character_generating', label: '이미지 생성' },
  { key: 'voice_generating', label: '음성 생성' },
  { key: 'asset_review', label: '캐릭터 검수' },
  { key: 'scenario_generating', label: '시나리오 생성' },
  { key: 'video_generating', label: '영상 생성' },
  { key: 'video_review', label: '영상 검수' },
  { key: 'completed', label: '완료' },
]

const STATUS_PROGRESS: Record<string, number> = {
  pending: 5,
  character_generating: 15,
  voice_generating: 25,
  character_review: 35,
  voice_review: 35,
  asset_generating: 20,
  asset_review: 35,
  scenario_generating: 50,
  scenario_review: 85,
  content_generating: 60,
  video_generating: 75,
  video_review: 90,
  completed: 100,
  failed: 0,
}

function getProgressPercentage(status: string, backendProgress?: number): number {
  // 백엔드에서 제공하는 실제 진행률 우선 사용
  if (backendProgress !== undefined && backendProgress > 0) {
    return backendProgress
  }
  // fallback: 상태 기반 기본값
  return STATUS_PROGRESS[status] ?? 0
}

function getStepIndex(status: string): number {
  const map: Record<string, number> = {
    pending: 0,
    character_generating: 1,
    voice_generating: 2,
    character_review: 3,
    voice_review: 3,
    asset_generating: 1,
    asset_review: 3,
    scenario_generating: 4,
    scenario_review: 6,
    content_generating: 4,
    video_generating: 5,
    video_review: 6,
    completed: 7,
    failed: -1,
  }
  return map[status] ?? 0
}

function isAssetReviewStatus(status: string): boolean {
  return ['character_review', 'voice_review', 'asset_review'].includes(status)
}

function isGeneratingStatus(status: string): boolean {
  return ['pending', 'scenario_generating', 'video_generating', 'character_generating', 'voice_generating', 'asset_generating', 'content_generating'].includes(status)
}

const GENERATING_LABELS: Record<string, string> = {
  pending: '영상 제작을 준비하고 있습니다',
  character_generating: '캐릭터 이미지를 생성하고 있습니다',
  voice_generating: '음성을 생성하고 있습니다',
  asset_generating: '캐릭터와 음성을 생성하고 있습니다',
  scenario_generating: '시나리오를 생성하고 있습니다',
  content_generating: '시나리오와 영상을 생성하고 있습니다',
  video_generating: '영상을 생성하고 있습니다',
}

const GENERATION_STEPS = [
  { key: 'pending', label: '정보 입력' },
  { key: 'character_generating', label: '이미지 생성' },
  { key: 'voice_generating', label: '음성 생성' },
  { key: 'scenario_generating', label: '시나리오 생성' },
  { key: 'video_generating', label: '영상 생성' },
]

function getGenerationStepIndex(status: string): number {
  const idx = GENERATION_STEPS.findIndex(s => s.key === status)
  return idx >= 0 ? idx : 0
}

function MetricTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card px-3 py-2">
        <p className="text-[var(--color-text-secondary)] text-xs mb-1">{label}</p>
        <p className="text-[var(--color-text)] font-bold text-sm">{payload[0].value.toLocaleString()}</p>
      </div>
    )
  }
  return null
}

export default function VideoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { showToast } = useToast()
  const { getTask } = useGeneration()
  const [video, setVideo] = useState<Video | null>(null)
  const [metrics, setMetrics] = useState<VideoMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'performance'>('info')
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [showCharacterRevision, setShowCharacterRevision] = useState(false)
  const [showVoiceRevision, setShowVoiceRevision] = useState(false)
  const [characterFeedback, setCharacterFeedback] = useState('')
  const [voiceFeedback, setVoiceFeedback] = useState('')
  const [sceneScenarioFeedbacks, setSceneScenarioFeedbacks] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState<'not_found' | 'server_error' | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [scenarioVersions, setScenarioVersions] = useState<ScenarioVersion[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(false)

  const videoId = Array.isArray(params.id) ? params.id[0] : (params.id as string)
  const generationTask = getTask(videoId)

  const fetchVideo = useCallback(async () => {
    const id = videoId
    setLoadError(null)
    try {
      const v = await videoApi.getProjectById(id)
      console.log('[VIDEO DETAIL] Received video data:', { id, status: v?.status, title: v?.title })
      // 시나리오 검수 상태일 때 씬 데이터 추가 로드
      if (v && (v.status === 'scenario_review' || v.status === 'video_review') && (!v.scenes || v.scenes.length === 0)) {
        try {
          const scenario = await scenarioApi.getScenarioByAd(id)
          if (scenario?.scenes) {
            v.scenes = scenario.scenes
          }
        } catch {
          // 시나리오 조회 실패는 무시 (아직 생성 중일 수 있음)
        }
      }
      setVideo(v)
      
      // 시나리오 검수 또는 영상 검수 상태일 때 버전 히스토리 로드
      if (v && (v.status === 'scenario_review' || v.status === 'video_review')) {
        fetchScenarioVersions(id)
      }
      
      // 완료된 영상이고 videoId가 있으면 실제 성과 데이터 로드
      if (v && v.status === 'completed' && v.videoId) {
        try {
          const performanceData = await clientAnalyticsApi.getVideoPerformance(v.videoId)
          // VideoPerformanceResponse를 VideoMetrics로 변환
          const transformedMetrics: VideoMetrics = {
            views: performanceData.latest_performance.views,
            likes: performanceData.latest_performance.likes,
            comments: performanceData.latest_performance.comments,
            shares: performanceData.latest_performance.shares,
            watchTime: performanceData.latest_performance.average_view_duration,
            completionRate: performanceData.duration_seconds 
              ? Math.round((performanceData.latest_performance.average_view_duration / performanceData.duration_seconds) * 100)
              : 0,
            engagementRate: performanceData.latest_performance.engagement_rate,
            dailyViews: performanceData.timeline.map(t => ({
              date: new Date(t.captured_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
              views: t.views
            })),
            hourlyViews: performanceData.hourly_views || []
          }
          setMetrics(transformedMetrics)
        } catch (error) {
          console.error('성과 데이터 로드 실패:', error)
          // 성과 데이터 로드 실패는 무시 (영상은 표시)
        }
      }
    } catch (error: unknown) {
      const isNotFound = error instanceof Error && error.message.includes('404')
      setLoadError(isNotFound ? 'not_found' : 'server_error')
      if (!isNotFound) {
        showToast('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 'error')
      }
    } finally {
      setLoading(false)
    }
  }, [videoId, showToast])

  const fetchScenarioVersions = async (adId: string) => {
    setLoadingVersions(true)
    try {
      const versions = await scenarioApi.getScenarioVersions(adId)
      setScenarioVersions(versions)
      // 가장 최신 버전을 기본 선택
      if (versions.length > 0) {
        setSelectedVersionId(versions[0].script_id)
      }
    } catch (error) {
      console.error('시나리오 버전 로드 실패:', error)
    } finally {
      setLoadingVersions(false)
    }
  }

  useEffect(() => {
    fetchVideo()
  }, [fetchVideo])

  // Context SSE 상태 변경 감지 → 전체 데이터 새로고침
  useEffect(() => {
    if (!video || !generationTask) return
    if (generationTask.status !== video.status) {
      fetchVideo()
    }
  }, [generationTask?.status, video?.status, fetchVideo])

  const handleDownload = async () => {
    if (!video) return
    if (!video.videoId) {
      showToast('다운로드할 영상이 아직 생성되지 않았습니다', 'error')
      return
    }
    try {
      const videoId = video.videoId
      if (!videoId) {
        showToast('영상 ID를 찾을 수 없습니다', 'error')
        return
      }
      const response = await finalApi.downloadVideo(videoId)
      try {
        const url = new URL(response.download_url)
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          showToast('유효하지 않은 다운로드 URL입니다', 'error')
          return
        }
      } catch {
        showToast('유효하지 않은 다운로드 URL입니다', 'error')
        return
      }
      const safeName = video.title.replace(/[^a-zA-Z0-9가-힣\s_-]/g, '_')
      const link = document.createElement('a')
      link.href = response.download_url
      link.download = `${safeName}.mp4`
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToast('다운로드가 시작되었습니다', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '다운로드 실패', 'error')
    }
  }

  const handleShare = async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      showToast('링크가 클립보드에 복사되었습니다', 'success')
    } catch {
      showToast('링크 복사에 실패했습니다', 'error')
    }
  }

  const handleRetryGeneration = async () => {
    if (!video) return
    const characterImagePrompt = video.characterImagePrompt
    if (!characterImagePrompt) {
      showToast('캐릭터 스타일 정보가 없습니다. 새로 요청해주세요.', 'error')
      return
    }
    setRetrying(true)
    try {
      await scenarioApi.retryGeneration(video.id, characterImagePrompt)
      showToast('재생성이 시작되었습니다', 'success')
      await fetchVideo()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '재생성 요청 실패', 'error')
    } finally {
      setRetrying(false)
    }
  }

  const toggleVoicePlay = () => {
    if (!video?.voiceSampleUrl) return
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
    } else {
      if (!audioRef.current || audioRef.current.src !== video.voiceSampleUrl) {
        audioRef.current = new Audio(video.voiceSampleUrl)
        audioRef.current.onended = () => setIsPlaying(false)
      }
      audioRef.current.play().catch(() => setIsPlaying(false))
      setIsPlaying(true)
    }
  }

  // 에셋(캐릭터+음성) 통합 승인 → 시나리오 생성 트리거 (폴링으로 완료 감지)
  const handleApproveAssets = async () => {
    if (!video) return
    const characterId = video.characterId
    if (!characterId) {
      showToast('캐릭터 정보를 찾을 수 없습니다', 'error')
      return
    }
    setSubmitting(true)
    let currentStep = ''
    try {
      // 1. 승인 처리
      currentStep = '캐릭터 승인'
      await scenarioApi.approveCharacter(video.id)
      currentStep = '음성 승인'
      await scenarioApi.approveVoice(video.id)
      showToast('에셋이 승인되었습니다! 시나리오 생성을 시작합니다.', 'success')

      // 2. 콘텐츠 통합 생성 요청 (시나리오+TTS+영상, BackgroundTasks → 폴링으로 완료 감지)
      currentStep = '콘텐츠 생성 요청'
      await scenarioApi.generateContent(video.id)

      // 3. 생성 중 상태로 전환 → 폴링이 완료를 감지
      setVideo(prev => prev ? { ...prev, status: 'content_generating' as Video['status'] } : prev)
      showToast('시나리오와 영상 생성이 시작되었습니다. 완료되면 자동으로 전환됩니다.', 'info')
    } catch (error) {
      const msg = error instanceof Error ? error.message : '알 수 없는 오류'
      showToast(`${currentStep} 단계에서 실패했습니다: ${msg}`, 'error')
      await fetchVideo()
    } finally {
      setSubmitting(false)
    }
  }

  // 캐릭터 수정 요청 (피드백 포함)
  const handleReviseCharacter = async () => {
    if (!video || !characterFeedback.trim()) {
      showToast('수정 요청 내용을 입력해주세요.', 'error')
      return
    }
    if (characterFeedback.length > 1000) {
      showToast('수정 요청은 1000자 이내로 입력해주세요.', 'error')
      return
    }
    const characterId = video.characterId
    if (!characterId) {
      showToast('캐릭터 정보를 찾을 수 없습니다', 'error')
      return
    }
    setSubmitting(true)
    try {
      await scenarioApi.reviseCharacter(video.id, characterFeedback)
      await fetchVideo()
      setCharacterFeedback('')
      setShowCharacterRevision(false)
      showToast('캐릭터 수정 요청이 접수되었습니다.', 'info')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '수정 요청 실패', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // 음성 수정 요청 (피드백 포함)
  const handleReviseVoice = async () => {
    if (!video || !voiceFeedback.trim()) {
      showToast('수정 요청 내용을 입력해주세요.', 'error')
      return
    }
    if (voiceFeedback.length > 1000) {
      showToast('수정 요청은 1000자 이내로 입력해주세요.', 'error')
      return
    }
    const characterId = video.characterId
    if (!characterId) {
      showToast('캐릭터 정보를 찾을 수 없습니다', 'error')
      return
    }
    setSubmitting(true)
    try {
      await scenarioApi.reviseVoice(video.id, voiceFeedback)
      await fetchVideo()
      setVoiceFeedback('')
      setShowVoiceRevision(false)
      showToast('음성 수정 요청이 접수되었습니다.', 'info')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '수정 요청 실패', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // 시나리오+영상 최종 승인 (통합 API)
  const handleApproveScenario = async () => {
    if (!video) return
    setSubmitting(true)
    try {
      await scenarioApi.approveContent(video.id)
      await fetchVideo()
      showToast('시나리오와 영상이 최종 승인되었습니다.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '최종 승인 실패', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // 시나리오+영상 통합 수정 요청 (단일 API 호출)
  const handleReviseScenarioWithScenes = async () => {
    if (!video) return
    const sceneRevisions = Object.keys(sceneScenarioFeedbacks)
      .map(Number)
      .filter(sceneNumber => sceneScenarioFeedbacks[sceneNumber]?.trim())
      .map(sceneNumber => ({
        scene_number: sceneNumber,
        scenario_notes: sceneScenarioFeedbacks[sceneNumber].trim(),
      }))

    if (sceneRevisions.length === 0) {
      showToast('수정할 내용을 입력해주세요.', 'error')
      return
    }

    setSubmitting(true)
    try {
      await scenarioApi.reviseContent(video.id, sceneRevisions)

      showToast('수정이 반영되어 시나리오와 영상을 재생성 중입니다.', 'info')
      setSceneScenarioFeedbacks({})
      
      // 서버 상태 새로고침
      await fetchVideo()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '수정 요청 실패', 'error')
      await fetchVideo()
    } finally {
      setSubmitting(false)
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-[var(--gradient-1)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!video) {
    return (
      <div className="text-center py-20">
        {loadError === 'server_error' ? (
          <>
            <p className="text-red-400 mb-2">서버 오류가 발생했습니다</p>
            <p className="text-[var(--color-text-secondary)] mb-4">잠시 후 다시 시도해주세요.</p>
            <button
              onClick={() => { setLoading(true); fetchVideo(); }}
              className="px-4 py-2 btn-primary rounded-lg mr-3"
            >
              다시 시도
            </button>
            <Link href="/user" className="text-[var(--color-text-secondary)] hover:underline">
              목록으로 돌아가기
            </Link>
          </>
        ) : (
          <>
            <p className="text-[var(--color-text-secondary)] mb-4">
              {loadError === 'not_found' ? '프로젝트를 찾을 수 없습니다' : '프로젝트가 아직 생성되지 않았습니다'}
            </p>
            <Link href="/user" className="text-[var(--gradient-1)] hover:underline">
              목록으로 돌아가기
            </Link>
          </>
        )}
      </div>
    )
  }

  const status = STATUS_CONFIG_WITH_BORDER[video.status] || { text: video.status, color: 'text-[#888]', bgColor: 'bg-[#1a1a1a] border-[#2a2a2a]' }
  const currentStep = getStepIndex(video.status)

  return (
    <div className="max-w-4xl mx-auto font-body">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-6">
        <Link href="/user" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors">
          My Videos
        </Link>
        <span className="text-[var(--color-text-tertiary)]">/</span>
        <span className="text-[var(--color-text)]">{video.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-display font-bold text-[var(--color-text)]">{video.title}</h1>
            <span className={`px-3 py-1 text-xs font-medium rounded-full border ${status.bgColor} ${status.color}`}>
              {status.text}
            </span>
          </div>
          <p className="text-[var(--color-text-secondary)]">{video.companyName} · {video.productCategory}</p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 glass-card text-[var(--color-text)] rounded-lg hover:bg-[var(--color-bg-muted)] transition-colors"
        >
          뒤로가기
        </button>
      </div>

      {/* Tabs (only for completed videos) */}
      {video.status === 'completed' && (
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'info'
                ? 'btn-primary'
                : 'glass-card text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            영상 정보
          </button>
          <button
            onClick={() => setActiveTab('performance')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'performance'
                ? 'btn-primary'
                : 'glass-card text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            성과 분석
          </button>
        </div>
      )}

      {/* Info Tab Content */}
      {(activeTab === 'info' || video.status !== 'completed') && (
        <>
          {/* Progress */}
          <div className="glass-card p-6 mb-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-6">진행 상황</h2>
            <div className="flex items-center justify-between relative">
              {progressSteps.map((step, i) => (
                <React.Fragment key={step.key}>
                  <div className="flex flex-col items-center relative z-10">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                        currentStep === -1
                          ? 'bg-red-500/10 text-red-400 border-2 border-red-500/30'
                          : i < currentStep
                          ? 'bg-[var(--gradient-1)] text-white'
                          : i === currentStep
                          ? 'bg-transparent text-[var(--gradient-1)] border-2 border-[var(--gradient-1)] shadow-[0_0_12px_rgba(255,107,107,0.4)]'
                          : 'bg-transparent text-[var(--color-text-tertiary)] border-2 border-[var(--color-border-strong)]'
                      }`}
                    >
                      {currentStep === -1 ? '!' : i < currentStep ? '✓' : i + 1}
                    </div>
                    <span className={`mt-3 text-xs whitespace-nowrap ${i <= currentStep ? 'text-[var(--color-text)]' : 'text-[var(--color-text-tertiary)]'}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < progressSteps.length - 1 && (
                    <div 
                      className={`flex-1 h-0.5 transition-colors ${
                        i < currentStep 
                          ? 'bg-[var(--gradient-1)]' 
                          : 'bg-[var(--color-border-strong)]'
                      }`}
                      style={{ marginTop: '-20px' }}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Video Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">영상 정보</h2>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-[var(--color-text-secondary)]">제품명</dt>
                  <dd className="text-[var(--color-text)]">{video.title}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--color-text-secondary)]">제품 카테고리</dt>
                  <dd className="text-[var(--color-text)]">{video.productCategory || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--color-text-secondary)]">요청일</dt>
                  <dd className="text-[var(--color-text)]">{video.createdAt}</dd>
                </div>
              </dl>
            </div>

            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">제품 설명</h2>
              <p className="text-[var(--color-text-secondary)] leading-relaxed">
                {video.productHighlight || '등록된 제품 설명이 없습니다.'}
              </p>
            </div>
          </div>

          {/* Asset Review (캐릭터 + 음성 통합 검수) */}
          {isAssetReviewStatus(video.status) && (
            <div className="glass-card p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">캐릭터 & 음성 검수</h2>
                <span className="px-3 py-1 bg-purple-500/10 text-purple-400 text-xs rounded-full border border-purple-500/20">
                  검수 필요
                </span>
              </div>

              {/* 캐릭터 이미지 비교 */}
              <div className="bg-[var(--color-bg)] rounded-xl p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-[var(--color-text)]">캐릭터 이미지</p>
                  {!showCharacterRevision && (
                    <button
                      onClick={() => setShowCharacterRevision(true)}
                      className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--gradient-1)] transition-colors"
                    >
                      수정
                    </button>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* 좌: 요청 스타일 */}
                  <div className="flex flex-col">
                    <span className="text-xs text-purple-400 font-medium mb-2 uppercase tracking-wider">요청</span>
                    <div className="flex-1 p-4 bg-purple-500/5 border border-purple-500/15 rounded-xl">
                      <p className="text-sm text-[var(--color-text)] leading-relaxed">{video.characterImagePrompt}</p>
                      {video.characterRevisionHistory && video.characterRevisionHistory.filter(h => h.feedback_type === 'image_revision').length > 0 && (
                        <div className="mt-3 pt-3 border-t border-purple-500/10">
                          <p className="text-xs text-[var(--color-text-tertiary)] mb-1.5">수정 이력</p>
                          {video.characterRevisionHistory.filter(h => h.feedback_type === 'image_revision').map((h, i) => (
                            <p key={i} className="text-xs text-[var(--color-text-secondary)] mt-1">
                              <span className="text-[var(--color-text-tertiary)]">{new Date(h.requested_at).toLocaleDateString('ko-KR')}</span>{' '}
                              {h.revision_notes}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 우: 생성 결과 */}
                  <div className="flex flex-col">
                    <span className="text-xs text-purple-400 font-medium mb-2 uppercase tracking-wider">결과</span>
                    {video.characterImageUrl ? (
                      <div className="relative flex-1 min-h-[200px] rounded-xl overflow-hidden bg-[var(--color-bg-muted)] flex items-center justify-center">
                        <Image
                          src={video.characterImageUrl}
                          alt="생성된 캐릭터"
                          fill
                          unoptimized
                          className="object-contain"
                        />
                      </div>
                    ) : (
                      <div className="flex-1 min-h-[200px] rounded-xl bg-[var(--color-bg-muted)] flex items-center justify-center">
                        <p className="text-[var(--color-text-tertiary)] text-sm">생성 중...</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 캐릭터 수정 요청 폼 */}
                {showCharacterRevision && (
                  <div className="mt-4 p-4 bg-purple-500/5 rounded-xl border border-purple-500/20">
                    <p className="text-sm font-medium text-purple-400 mb-3">캐릭터 수정</p>
                    <textarea
                      value={characterFeedback}
                      onChange={(e) => setCharacterFeedback(e.target.value)}
                      maxLength={1000}
                      placeholder="원하는 수정 방향을 자세히 설명해주세요. (예: 머리카락을 더 짧게, 표정을 더 밝게...)"
                      className="w-full h-24 px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] resize-none focus:outline-none focus:border-purple-500/50"
                    />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleReviseCharacter}
                        disabled={submitting || !characterFeedback.trim()}
                        className="flex-1 py-2 bg-purple-500 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? '요청 중...' : '수정'}
                      </button>
                      <button
                        onClick={() => { setShowCharacterRevision(false); setCharacterFeedback(''); }}
                        className="px-4 py-2 text-[var(--color-text-secondary)] text-sm hover:text-[var(--color-text)]"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 음성 샘플 비교 */}
              <div className="bg-[var(--color-bg)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-[var(--color-text)]">음성 샘플</p>
                  {!showVoiceRevision && (
                    <button
                      onClick={() => setShowVoiceRevision(true)}
                      className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--gradient-1)] transition-colors"
                    >
                      수정
                    </button>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* 좌: 요청 스타일 */}
                  <div className="flex flex-col">
                    <span className="text-xs text-pink-400 font-medium mb-2 uppercase tracking-wider">요청</span>
                    <div className="flex-1 p-4 bg-pink-500/5 border border-pink-500/15 rounded-xl">
                      <p className="text-sm text-[var(--color-text)] leading-relaxed">{video.characterVoicePrompt}</p>
                      {video.characterRevisionHistory && video.characterRevisionHistory.filter(h => h.feedback_type === 'voice_revision').length > 0 && (
                        <div className="mt-3 pt-3 border-t border-pink-500/10">
                          <p className="text-xs text-[var(--color-text-tertiary)] mb-1.5">수정 이력</p>
                          {video.characterRevisionHistory.filter(h => h.feedback_type === 'voice_revision').map((h, i) => (
                            <p key={i} className="text-xs text-[var(--color-text-secondary)] mt-1">
                              <span className="text-[var(--color-text-tertiary)]">{new Date(h.requested_at).toLocaleDateString('ko-KR')}</span>{' '}
                              {h.revision_notes}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 우: 생성 결과 */}
                  <div className="flex flex-col">
                    <span className="text-xs text-pink-400 font-medium mb-2 uppercase tracking-wider">결과</span>
                    <div className="flex-1 min-h-[200px] rounded-xl bg-[var(--color-bg-muted)] flex flex-col items-center justify-center">
                      {video.voiceSampleUrl ? (
                        <>
                          <button
                            onClick={toggleVoicePlay}
                            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                              isPlaying
                                ? 'bg-pink-500 text-white'
                                : 'bg-[var(--color-bg)] text-pink-400 hover:bg-pink-500/20 border border-pink-500/30'
                            }`}
                          >
                            {isPlaying ? (
                              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                              </svg>
                            ) : (
                              <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </button>
                          <p className="text-[var(--color-text-secondary)] text-sm mt-4">
                            {isPlaying ? '재생 중...' : '클릭하여 재생'}
                          </p>
                        </>
                      ) : (
                        <p className="text-[var(--color-text-tertiary)] text-sm">생성 중...</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 음성 수정 요청 폼 */}
                {showVoiceRevision && (
                  <div className="mt-4 p-4 bg-pink-500/5 rounded-xl border border-pink-500/20">
                    <p className="text-sm font-medium text-pink-400 mb-3">음성 수정</p>
                    <textarea
                      value={voiceFeedback}
                      onChange={(e) => setVoiceFeedback(e.target.value)}
                      maxLength={1000}
                      placeholder="원하는 수정 방향을 자세히 설명해주세요. (예: 톤을 더 밝게, 말하는 속도를 더 느리게...)"
                      className="w-full h-24 px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] resize-none focus:outline-none focus:border-pink-500/50"
                    />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleReviseVoice}
                        disabled={submitting || !voiceFeedback.trim()}
                        className="flex-1 py-2 bg-pink-500 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? '요청 중...' : '수정'}
                      </button>
                      <button
                        onClick={() => { setShowVoiceRevision(false); setVoiceFeedback(''); }}
                        className="px-4 py-2 text-[var(--color-text-secondary)] text-sm hover:text-[var(--color-text)]"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 안내 및 승인 버튼 */}
              <div className="mt-6 p-4 bg-[var(--color-bg-muted)] rounded-xl">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  위 캐릭터와 음성으로 영상이 제작됩니다. 모두 확인 후 승인해주세요.
                  수정이 필요한 항목이 있다면 각 항목의 "수정"을 클릭해주세요.
                </p>
              </div>

              <button
                onClick={handleApproveAssets}
                disabled={submitting || showCharacterRevision || showVoiceRevision}
                className="w-full mt-4 py-3.5 btn-primary rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '처리 중...' : '모두 승인하고 시나리오 생성 시작'}
              </button>
            </div>
          )}

          {/* Generating Status (단계별 진행 카드) */}
          {isGeneratingStatus(video.status) && (
            <div className="glass-card p-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="relative">
                  <div className="w-10 h-10 border-3 border-[var(--color-border-strong)] rounded-full" />
                  <div className="absolute top-0 left-0 w-10 h-10 border-3 border-transparent border-t-[var(--gradient-1)] rounded-full animate-spin" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--color-text)]">
                    {GENERATING_LABELS[video.status] || 'AI가 작업 중입니다'}
                  </h3>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    완료되면 자동으로 검수 화면으로 전환됩니다
                  </p>
                </div>
              </div>

              {/* Step Checklist */}
              <div className="space-y-3 mb-6">
                {GENERATION_STEPS.map((step, i) => {
                  const activeIdx = getGenerationStepIndex(video.status)
                  const isDone = i < activeIdx
                  const isActive = i === activeIdx
                  return (
                    <div key={step.key} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      isActive ? 'bg-[var(--gradient-1)]/10 border border-[var(--gradient-1)]/20' :
                      isDone ? 'bg-[var(--color-bg-muted)]' :
                      'bg-[var(--color-bg-muted)]/50'
                    }`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isDone ? 'bg-[var(--gradient-1)] text-white' :
                        isActive ? 'border-2 border-[var(--gradient-1)] text-[var(--gradient-1)]' :
                        'border-2 border-[var(--color-border-strong)] text-[var(--color-text-tertiary)]'
                      }`}>
                        {isDone ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : isActive ? (
                          <div className="w-2 h-2 bg-[var(--gradient-1)] rounded-full animate-pulse" />
                        ) : (
                          <span className="text-xs font-medium">{i + 1}</span>
                        )}
                      </div>
                      <span className={`text-sm ${
                        isActive ? 'text-[var(--color-text)] font-medium' :
                        isDone ? 'text-[var(--color-text-secondary)]' :
                        'text-[var(--color-text-tertiary)]'
                      }`}>
                        {step.label}
                        {isActive && <span className="ml-2 text-[var(--gradient-1)]">진행 중...</span>}
                        {isDone && <span className="ml-2 text-[var(--color-text-tertiary)]">완료</span>}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[var(--color-text-tertiary)]">전체 진행률</span>
                  <span className="text-xs font-medium text-[var(--color-text)]">{getProgressPercentage(video.status, video.progressPercentage)}%</span>
                </div>
                <div className="w-full h-2 bg-[var(--color-bg-muted)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${getProgressPercentage(video.status, video.progressPercentage)}%`,
                      background: 'linear-gradient(90deg, var(--gradient-1), var(--gradient-4))',
                    }}
                  />
                </div>
              </div>

              {/* Hint */}
              <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-muted)] rounded-lg">
                <svg className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  다른 페이지로 이동해도 알림을 받을 수 있습니다
                </p>
              </div>
            </div>
          )}

          {/* Failed Status */}
          {video.status === 'failed' && (
            <div className="glass-card p-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-red-400">생성 중 오류가 발생했습니다</h3>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    일시적인 오류일 수 있습니다. 다시 시도해주세요.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-red-500/5 border border-red-500/15 rounded-xl mb-6">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  영상 생성 과정에서 문제가 발생했습니다. 아래 버튼으로 처음부터 다시 생성을 시도할 수 있습니다.
                  문제가 반복되면 관리자에게 문의해주세요.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRetryGeneration}
                  disabled={retrying}
                  className="flex-1 py-3.5 btn-primary rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {retrying ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      재생성 중...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      다시 생성하기
                    </>
                  )}
                </button>
                <Link
                  href="/user"
                  className="flex-1 py-3.5 glass-card text-[var(--color-text)] rounded-xl hover:bg-[var(--color-bg-muted)] transition-colors flex items-center justify-center gap-2"
                >
                  목록으로 돌아가기
                </Link>
              </div>
            </div>
          )}

          {/* Integrated Scenario + Video Review */}
          {(video.status === 'scenario_review' || video.status === 'video_review') && (
            <div className="glass-card p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">시나리오 / 영상 통합 검수</h2>
                <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full border border-blue-500/20">
                  검수 필요
                </span>
              </div>

              {/* Video Player */}
              <div className="mb-6">
                <p className="text-sm text-[var(--color-text-secondary)] mb-3">미리보기 영상</p>
                {video.videoUrl ? (
                  <div className="aspect-video bg-[var(--color-bg)] rounded-xl overflow-hidden">
                    <video
                      src={video.videoUrl}
                      controls
                      className="w-full h-full object-contain"
                      poster="https://placehold.co/1280x720/1a1a1a/666666?text=Loading..."
                    >
                      브라우저가 비디오 태그를 지원하지 않습니다.
                    </video>
                  </div>
                ) : (
                  <div className="aspect-video bg-[var(--color-bg)] rounded-xl flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-[var(--color-bg-muted)] rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-8 h-8 text-[var(--color-text-tertiary)]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      <p className="text-[var(--color-text-tertiary)] text-sm">영상 준비 중...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Scenario Version History */}
              {scenarioVersions.length > 0 && (
                <div className="mb-6 bg-[var(--color-bg)] rounded-xl p-5 border border-[var(--color-border)]">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-[var(--gradient-1)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-sm font-semibold text-[var(--color-text)]">시나리오 버전 히스토리</h3>
                    </div>
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      총 {scenarioVersions.length}개 버전
                    </span>
                  </div>

                  {loadingVersions ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-[var(--gradient-1)] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scenarioVersions.map((version, index) => {
                        const isLatest = index === 0
                        const isSelected = selectedVersionId === version.script_id
                        const isCurrentVideo = version.script_id === video.scriptId
                        
                        return (
                          <div
                            key={version.script_id}
                            className={`relative p-4 rounded-lg border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[var(--gradient-1)]/10 border-[var(--gradient-1)]/30'
                                : 'bg-[var(--color-bg-muted)] border-[var(--color-border)] hover:border-[var(--gradient-1)]/20'
                            }`}
                            onClick={() => setSelectedVersionId(version.script_id)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-medium text-[var(--color-text)]">
                                    버전 {scenarioVersions.length - index}
                                  </span>
                                  {isLatest && (
                                    <span className="px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded border border-green-500/20">
                                      최신
                                    </span>
                                  )}
                                  {isCurrentVideo && (
                                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded border border-blue-500/20">
                                      현재 영상
                                    </span>
                                  )}
                                  {version.approval_status === 'approved' && (
                                    <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-xs rounded border border-purple-500/20">
                                      승인됨
                                    </span>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    {new Date(version.created_at).toLocaleString('ko-KR', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                  
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    {version.scenes?.length || 0}개 씬
                                  </span>

                                  {version.generation_type && (
                                    <span className="flex items-center gap-1">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                      </svg>
                                      {version.generation_type === 'initial' ? '최초 생성' : 
                                       version.generation_type === 'regenerated' ? '재생성' : 
                                       version.generation_type === 'revised' ? '수정됨' : version.generation_type}
                                    </span>
                                  )}
                                </div>

                                {version.revision_notes && (
                                  <div className="mt-2 p-2 bg-[var(--color-bg)]/50 rounded text-xs text-[var(--color-text-secondary)] border-l-2 border-yellow-500/30">
                                    <span className="text-yellow-400 font-medium">수정 요청: </span>
                                    {version.revision_notes}
                                  </div>
                                )}
                              </div>

                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'border-[var(--gradient-1)] bg-[var(--gradient-1)]'
                                  : 'border-[var(--color-border-strong)]'
                              }`}>
                                {isSelected && (
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Scene-by-Scene Scenario - 2x2 Grid */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {selectedVersionId && scenarioVersions.find(v => v.script_id === selectedVersionId)
                      ? `버전 ${scenarioVersions.length - scenarioVersions.findIndex(v => v.script_id === selectedVersionId)} 씬별 내용`
                      : '씬별 검수'}
                  </p>
                  <span className="text-xs text-[var(--color-text-tertiary)]">수정이 필요한 씬에만 피드백을 입력하세요</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {(() => {
                    // 선택된 버전의 씬 데이터 가져오기
                    const selectedVersion = scenarioVersions.find(v => v.script_id === selectedVersionId)
                    const scenesToDisplay = selectedVersion?.scenes || video.scenes || []
                    
                    return scenesToDisplay.length > 0 ? (
                      scenesToDisplay.map((scene) => {
                        const sceneColors = [
                          { bg: 'from-blue-500/10 to-blue-600/5', border: 'border-blue-500/20', accent: 'text-blue-400', ring: 'focus:ring-blue-500/30' },
                          { bg: 'from-purple-500/10 to-purple-600/5', border: 'border-purple-500/20', accent: 'text-purple-400', ring: 'focus:ring-purple-500/30' },
                          { bg: 'from-pink-500/10 to-pink-600/5', border: 'border-pink-500/20', accent: 'text-pink-400', ring: 'focus:ring-pink-500/30' },
                          { bg: 'from-orange-500/10 to-orange-600/5', border: 'border-orange-500/20', accent: 'text-orange-400', ring: 'focus:ring-orange-500/30' },
                        ]
                        const color = sceneColors[(scene.scene_number - 1) % 4]
                        return (
                          <div
                            key={scene.scene_number}
                            className={`relative bg-gradient-to-br ${color.bg} rounded-2xl p-5 border ${color.border} transition-all hover:scale-[1.01]`}
                          >
                            {/* Scene Header */}
                            <div className="flex items-center gap-3 mb-4">
                              <div className={`w-8 h-8 rounded-lg bg-[var(--color-bg)] flex items-center justify-center text-sm font-bold ${color.accent}`}>
                                {scene.scene_number}
                              </div>
                              <div className="flex-1">
                                <span className="text-sm font-medium text-[var(--color-text)]">Scene {scene.scene_number}</span>
                                {scene.timestamp && (
                                  <span className="text-xs text-[var(--color-text-tertiary)] ml-2">{scene.timestamp}</span>
                                )}
                              </div>
                            </div>

                            {/* Scene Content */}
                            <div className="bg-[var(--color-bg)]/50 rounded-xl p-3 mb-4 max-h-24 overflow-y-auto">
                              <pre className="text-[var(--color-text-secondary)] text-xs whitespace-pre-wrap font-body leading-relaxed">
                                {scene.content}
                              </pre>
                            </div>

                            {/* Feedback Input - 최신 버전에만 표시 */}
                            {selectedVersionId === scenarioVersions[0]?.script_id && (
                              <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <svg className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <label className="text-xs text-[var(--color-text-tertiary)]">수정 요청</label>
                                </div>
                                <textarea
                                  value={sceneScenarioFeedbacks[scene.scene_number] || ''}
                                  onChange={(e) => setSceneScenarioFeedbacks(prev => ({ ...prev, [scene.scene_number]: e.target.value }))}
                                  placeholder="대사, 내용 수정 요청..."
                                  className={`w-full h-14 px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] resize-none focus:outline-none focus:ring-2 ${color.ring} focus:border-transparent transition-all`}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <div className="col-span-2 bg-[var(--color-bg)] rounded-xl p-8 text-center">
                        <p className="text-[var(--color-text-tertiary)] text-sm">시나리오가 없습니다.</p>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleReviseScenarioWithScenes}
                  disabled={submitting || Object.values(sceneScenarioFeedbacks).every(f => !f.trim())}
                  className="flex-1 py-3.5 glass-card text-[var(--color-text)] rounded-xl hover:bg-[var(--color-bg-muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  {submitting ? '처리 중...' : '수정 요청'}
                </button>
                <button
                  onClick={handleApproveScenario}
                  disabled={submitting}
                  className="flex-1 py-3.5 btn-primary rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {submitting ? '처리 중...' : '최종 승인'}
                </button>
              </div>
            </div>
          )}

          {/* Completed Video - Show all approved items */}
          {video.status === 'completed' && (
            <>
              {/* Approved Items Summary */}
              {(video.characterImageUrl || video.voiceSampleUrl) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {video.characterImageUrl && (
                    <div className="glass-card p-4">
                      <p className="text-sm text-[var(--color-text-secondary)] mb-3">캐릭터</p>
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-[var(--color-bg)]">
                        <Image
                          src={video.characterImageUrl}
                          alt="캐릭터"
                          fill
                          unoptimized
                          className="object-contain"
                        />
                      </div>
                    </div>
                  )}
                  {video.voiceSampleUrl && (
                    <div className="glass-card p-4">
                      <p className="text-sm text-[var(--color-text-secondary)] mb-3">음성</p>
                      <div className="aspect-square rounded-lg bg-[var(--color-bg)] flex items-center justify-center">
                        <button
                          onClick={toggleVoicePlay}
                          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                            isPlaying
                              ? 'bg-pink-500 text-white'
                              : 'bg-[var(--color-bg-muted)] text-pink-400 hover:bg-pink-500/20'
                          }`}
                        >
                          {isPlaying ? (
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                            </svg>
                          ) : (
                            <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Video Preview */}
              <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">완성 영상</h2>
                <div className="aspect-video bg-[var(--color-bg)] rounded-xl overflow-hidden mb-4">
                  {video.videoUrl ? (
                    <video
                      src={video.videoUrl}
                      controls
                      className="w-full h-full object-contain"
                      poster="https://placehold.co/1280x720/1a1a1a/666666?text=Loading..."
                    >
                      브라우저가 비디오 태그를 지원하지 않습니다.
                    </video>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-[var(--color-bg-muted)] rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg className="w-8 h-8 text-[var(--gradient-1)]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                        <p className="text-[var(--color-text-secondary)] text-sm">영상을 불러올 수 없습니다</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleDownload}
                    className="flex-1 py-3 btn-primary rounded-xl flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    다운로드
                  </button>
                  <button
                    onClick={handleShare}
                    className="px-6 py-3 glass-card text-[var(--color-text)] rounded-xl hover:bg-[var(--color-bg-muted)] transition-colors"
                  >
                    공유
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Performance Tab Content */}
      {activeTab === 'performance' && video.status === 'completed' && metrics && (
        <>
          {/* Performance Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="glass-card p-4">
              <p className="text-[var(--color-text-secondary)] text-xs mb-1">총 조회수</p>
              <p className="text-[var(--color-text)] text-2xl font-bold">{metrics.views.toLocaleString()}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[var(--color-text-secondary)] text-xs mb-1">시청 완료율</p>
              <p className="text-[var(--color-text)] text-2xl font-bold">{metrics.completionRate}%</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[var(--color-text-secondary)] text-xs mb-1">평균 시청 시간</p>
              <p className="text-[var(--color-text)] text-2xl font-bold">{metrics.watchTime}초</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[var(--color-text-secondary)] text-xs mb-1">참여율</p>
              <p className="text-[var(--color-text)] text-2xl font-bold">{metrics.engagementRate.toFixed(1)}%</p>
            </div>
          </div>

          {/* Engagement Metrics */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="glass-card p-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              </div>
              <div>
                <p className="text-[var(--color-text-secondary)] text-xs">좋아요</p>
                <p className="text-[var(--color-text)] text-lg font-bold">{metrics.likes.toLocaleString()}</p>
              </div>
            </div>
            <div className="glass-card p-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <p className="text-[var(--color-text-secondary)] text-xs">댓글</p>
                <p className="text-[var(--color-text)] text-lg font-bold">{metrics.comments.toLocaleString()}</p>
              </div>
            </div>
            <div className="glass-card p-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <div>
                <p className="text-[var(--color-text-secondary)] text-xs">공유</p>
                <p className="text-[var(--color-text)] text-lg font-bold">{metrics.shares.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Daily Views Chart */}
          <div className="glass-card p-6 mb-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">일별 조회수</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.dailyViews}>
                  <defs>
                    <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff6b6b" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ff6b6b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" stroke="var(--color-text-tertiary)" fontSize={12} />
                  <YAxis stroke="var(--color-text-tertiary)" fontSize={12} />
                  <Tooltip content={<MetricTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke="#ff6b6b"
                    strokeWidth={2}
                    fill="url(#viewsGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Hourly Views Chart */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">시간대별 조회 패턴</h2>
            <p className="text-[var(--color-text-secondary)] text-sm mb-4">언제 시청자들이 가장 많이 보는지 확인하세요</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.hourlyViews}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="hour"
                    stroke="var(--color-text-tertiary)"
                    fontSize={10}
                    tickFormatter={(h) => `${h}시`}
                  />
                  <YAxis stroke="var(--color-text-tertiary)" fontSize={10} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="glass-card px-3 py-2">
                            <p className="text-[var(--color-text-secondary)] text-xs mb-1">{label}시</p>
                            <p className="text-[var(--color-text)] font-bold text-sm">{(payload[0].value as number).toLocaleString()}회</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="views" fill="#ff6b6b" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
