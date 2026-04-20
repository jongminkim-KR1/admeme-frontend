import { api, MOCK_MODE } from './client'
import { getVideos, getVideoById, addVideo, approveScenario, approveCharacter, requestCharacterRevision, approveVoice, requestVoiceRevision } from './mock'
import type { Video, MyProjectWorkflowResponse, CharacterResponse, ProjectResponse, ScenarioResponse, WorkflowStatusResponse, WorkflowDetailResponse, ScenarioVersion } from '@/types'

// ============================================
// Helper Functions
// ============================================

function transformProjectToVideo(project: ProjectResponse & { character_id?: number; scenes?: Array<{ scene_number: number; content: string; timestamp?: string }> }): Video {
  return {
    id: String(project.ad_id),
    title: project.title,
    status: project.status as Video['status'],
    views: project.views || 0,
    createdAt: project.created_at.split('T')[0],
    companyName: project.company_name,
    productCategory: project.product_category,
    productHighlight: project.product_highlight,
    productImageUrl: project.product_image_url || undefined,
    characterImagePrompt: project.character_style,
    memeType: project.meme_type as Video['memeType'],
    characterImageUrl: project.character_image_url || undefined,
    voiceSampleUrl: project.voice_sample_url || undefined,
    characterId: project.character_id,
    videoUrl: project.video_url || undefined,
    scenes: project.scenes,
  }
}

function transformWorkflowToVideo(workflow: MyProjectWorkflowResponse): Video {
  const statusMap: Record<string, Video['status']> = {
    'draft': 'character_generating',  // 이미지 생성
    'created': 'character_generating',  // 이미지 생성
    'generating_character': 'voice_generating',  // 음성 생성
    'pending_approval': 'character_review',  // 캐릭터 검수 (기본값)
    'generating_scenario': 'scenario_generating',  // 시나리오 생성
    'content_generating': 'scenario_generating',  // 시나리오 생성
    'generating_video': 'video_generating',  // 영상 생성
    'completed': 'completed',
    'failed': 'failed',
  }

  let mappedStatus = statusMap[workflow.status] || 'character_generating'

  // current_stage 기반으로 더 정확한 상태 매핑
  if (workflow.current_stage) {
    const stage = workflow.current_stage.toLowerCase()
    
    if (workflow.status === 'pending_approval') {
      if (stage.includes('video') || stage.includes('scenario')) {
        mappedStatus = 'video_review'  // 영상 검수
      } else if (stage.includes('character') || stage.includes('voice')) {
        mappedStatus = 'character_review'  // 캐릭터 검수
      }
    }
  }

  console.log(`[TRANSFORM] ad_id=${workflow.ad_id}, status=${workflow.status}, stage=${workflow.current_stage}, mapped=${mappedStatus}`)

  return {
    id: String(workflow.ad_id),
    title: workflow.item_name || '제목 없음',
    status: mappedStatus,
    views: 0,
    createdAt: workflow.created_at.split('T')[0],
    characterId: workflow.character_id,
  }
}

// ============================================
// Video API
// ============================================

export const videoApi = {
  async generateVideo(formData: FormData) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 1000))
      const productName = formData.get('product_name') as string
      const companyName = formData.get('company_name') as string
      return addVideo({
        companyName: companyName || '테스트 회사',
        productName: productName || '새 제품',
        productCategory: formData.get('product_category') as string || '기타',
        productHighlight: formData.get('product_highlight') as string || '',
      })
    }

    return api.postFormData<{ ad_id: number; execution_id: string }>('/api/v1/videos/generate', formData)
  },

  async suggestCharacterPrompts(data: {
    product_name: string
    product_category?: string
    product_description?: string
  }) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 400))
      return {
        character_image_prompt: `A friendly mascot character for ${data.product_name}, cheerful mood, clean illustration style, full body shot, soft lighting.`,
        character_voice_prompt: 'A warm, friendly voice with an upbeat and approachable tone.',
      }
    }

    return api.post<{
      character_image_prompt: string
      character_voice_prompt: string
    }>('/api/v1/videos/characters/prompts', data)
  },

  async getCharacters() {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return [
        { id: 1, name: '친근한 여성', description: '밝고 친근한 느낌', image_url: 'https://placehold.co/200x200', voice_id: null },
        { id: 2, name: '전문가 남성', description: '신뢰감 있는 차분한 느낌', image_url: 'https://placehold.co/200x200', voice_id: null },
      ]
    }

    return api.get<CharacterResponse[]>('/api/v1/videos/characters')
  },

  async getCharacterPreview(characterId: number) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return { id: characterId, name: '캐릭터', description: '설명', image_url: 'https://placehold.co/400x400', voice_id: null }
    }

    return api.get<CharacterResponse>(`/api/v1/videos/character/${characterId}`)
  },

  async getMyProjects(page = 1, perPage = 10) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      const videos = getVideos()
      return {
        items: videos,
        total: videos.length,
        page,
        per_page: perPage,
        total_pages: Math.ceil(videos.length / perPage),
      }
    }

    const offset = (page - 1) * perPage
    const response = await api.get<{ workflows: MyProjectWorkflowResponse[]; total_count: number }>(`/api/v1/status/my-projects?offset=${offset}&limit=${perPage}`)

    const items = response.workflows.map(transformWorkflowToVideo)
    return {
      items,
      total: response.total_count,
      page,
      per_page: perPage,
      total_pages: Math.ceil(response.total_count / perPage),
    }
  },

  async getProjectById(id: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 200))
      return getVideoById(id)
    }

    const response = await api.get<ProjectResponse & {
      character_id?: number
      item_name?: string
      item_category?: string
      item_description?: string
      company_name?: string
      character_image_prompt?: string
      character_voice_prompt?: string
      character_revision_history?: Array<{ feedback_type: string; revision_notes: string; requested_at: string }>
      workflow?: { status: string; current_stage?: string; progress_percentage?: number }
      video?: { video_id?: number; s3_url?: string; thumbnail_url?: string; duration_seconds?: number; status?: string }
    }>(`/api/v1/videos/${id}`)

    if (response.item_name) {
      // ad_request.status를 우선 사용 (백엔드에서 정확한 상태 관리)
      let mappedStatus: Video['status'] = 'character_generating'
      const adStatus = response.status // ad_request.status
      const stage = response.workflow?.current_stage?.toLowerCase() || ''

      // ad_request.status 기반 매핑
      if (adStatus === 'draft' || adStatus === 'created') {
        mappedStatus = 'character_generating'  // 이미지 생성
      } else if (adStatus === 'generating_character') {
        mappedStatus = 'voice_generating'  // 음성 생성
      } else if (adStatus === 'pending_approval') {
        // current_stage로 구분
        if (stage.includes('video') || stage.includes('scenario')) {
          mappedStatus = 'video_review'  // 영상 검수
        } else {
          mappedStatus = 'character_review'  // 캐릭터 검수
        }
      } else if (adStatus === 'generating_scenario' || adStatus === 'content_generating') {
        mappedStatus = 'scenario_generating'  // 시나리오 생성
      } else if (adStatus === 'generating_video') {
        mappedStatus = 'video_generating'  // 영상 생성
      } else if (adStatus === 'completed') {
        mappedStatus = 'completed'
      } else if (adStatus === 'failed') {
        mappedStatus = 'failed'
      }

      return {
        id: String(response.ad_id),
        title: response.item_name,
        status: mappedStatus,
        views: 0,
        createdAt: response.created_at.split('T')[0],
        companyName: response.company_name || undefined,
        productCategory: response.item_category || undefined,
        productHighlight: response.item_description || undefined,
        characterImagePrompt: response.character_image_prompt || undefined,
        characterVoicePrompt: response.character_voice_prompt || undefined,
        characterRevisionHistory: response.character_revision_history || undefined,
        characterImageUrl: response.character_image_url || undefined,
        voiceSampleUrl: response.voice_sample_url || undefined,
        videoId: response.video?.video_id,
        videoUrl: response.video?.s3_url || undefined,
        characterId: response.character_id,
      }
    }

    return transformProjectToVideo(response)
  },

  async generateCharacter(adId: number, data: {
    character_style: string
    reference_image_url?: string
    additional_prompts?: string
  }) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 1000))
      return { character_id: 1, status: 'generating' }
    }

    return api.post<{ character_id: number; status: string }>('/api/v1/videos/characters/generate', {
      ad_id: adId,
      ...data,
    })
  },

  async generateVoice(characterId: number, data: {
    voice_style: string
    sample_text?: string
    reference_audio_url?: string
  }) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 1000))
      return { voice_id: 'voice_123', status: 'generating' }
    }

    return api.post<{ voice_id: string; status: string }>(
      `/api/v1/videos/characters/${characterId}/voice/generate`,
      data
    )
  },

  async getVoicePreview(characterId: number) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return { voice_id: 'voice_123', preview_url: '/mock-voice-sample.mp3', status: 'ready' }
    }

    return api.get<{ voice_id: string; preview_url: string; status: string }>(
      `/api/v1/videos/characters/${characterId}/voice`
    )
  },

  async reviseCharacterImage(characterId: number, data: {
    revision_notes: string
    character_prompt?: string
  }) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 1000))
      return {
        character_id: characterId,
        character_name: '캐릭터',
        image_url: 'https://placehold.co/400x400/1a1a1a/c8ff00?text=Revised',
        size_bytes: 150000,
        created_at: new Date().toISOString(),
        message: '캐릭터 이미지를 재생성합니다',
      }
    }

    return api.post<{
      character_id: number
      character_name: string
      image_url: string
      size_bytes: number
      created_at: string
      message: string
    }>(`/api/v1/videos/character/${characterId}/revise`, data)
  },

  async deleteProject(adId: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      const { deleteVideo } = await import('./mock')
      deleteVideo(adId)
      return { message: '영상이 삭제되었습니다' }
    }

    return api.delete<{ message: string }>(`/api/v1/videos/${adId}`)
  },

  async reviseVoice(characterId: number, data: {
    revision_notes?: string
    rejection_reason?: string
    sample_text?: string
    approved?: boolean
  }) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 1000))
      return {
        character_id: characterId,
        voice_url: '/mock-voice-revised.mp3',
        voice_id: 'voice_revised_' + Date.now(),
        duration_seconds: 3.5,
        size_bytes: 50000,
        created_at: new Date().toISOString(),
        message: '음성을 재생성합니다',
      }
    }

    return api.post<{
      character_id: number
      voice_url: string
      voice_id: string | null
      duration_seconds: number | null
      size_bytes: number
      created_at: string
      message: string
    }>(`/api/v1/videos/characters/${characterId}/voice/revise`, data)
  },
}

// ============================================
// Scenario API
// ============================================

export const scenarioApi = {
  async getScenarioByAd(adId: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 200))
      return {
        script_id: 1,
        title: '테스트 시나리오',
        scenes: [
          { scene_number: 1, content: 'Hook 씬', timestamp: '0:00' },
          { scene_number: 2, content: 'Body 씬 1', timestamp: '0:05' },
          { scene_number: 3, content: 'Body 씬 2', timestamp: '0:10' },
          { scene_number: 4, content: 'Close 씬', timestamp: '0:15' },
        ],
        approval_status: 'pending',
      }
    }

    return api.get<{
      script_id: number
      title: string
      description?: string
      scenes: Array<{ scene_number: number; content: string; timestamp?: string }>
      approval_status: string
    }>(`/api/v1/video/${adId}/scenario`)
  },

  async generateScenario(adId: string, memeId?: number) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 2000))
      return {
        script_id: 1,
        title: '테스트 시나리오',
        scenes: [
          { scene_number: 1, content: 'Hook 씬', timestamp: '0:00' },
          { scene_number: 2, content: 'Body 씬 1', timestamp: '0:05' },
          { scene_number: 3, content: 'Body 씬 2', timestamp: '0:10' },
          { scene_number: 4, content: 'Close 씬', timestamp: '0:15' },
        ],
        status: 'generated',
      }
    }

    return api.post<{
      script_id: number
      title: string
      scenes: Array<{ scene_number: number; content: string; timestamp?: string }>
      status: string
    }>(`/api/v1/video/${adId}/scenario/generate`, {
      meme_id: memeId,
    })
  },

  async getScenarios(videoId: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      const video = getVideoById(videoId)
      if (!video?.scenario) return []
      return [{
        scenario_id: 1,
        ad_id: parseInt(videoId),
        content: video.scenario,
        version: 1,
        status: 'pending' as const,
        created_at: new Date().toISOString(),
        feedback: null,
      }]
    }

    return api.get<ScenarioResponse[]>(`/api/v1/video/${videoId}/scenarios`)
  },

  async approveScenario(adId: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return approveScenario(adId)
    }

    return api.post<{ message: string }>(`/api/v1/video/${adId}/scenario/approve`, { approved: true })
  },

  async reviseScenario(
    videoId: string,
    scenarioId: number,
    sceneRevisions: Array<{ scene_number: number; scenario_notes: string; video_notes: string }>,
    generalNotes?: string
  ) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 2000))
      return {
        script_id: scenarioId,
        title: '수정된 시나리오',
        scenes: sceneRevisions.map(r => ({
          scene_number: r.scene_number,
          content: `수정됨: ${r.scenario_notes}`,
          timestamp: `0:${((r.scene_number - 1) * 5).toString().padStart(2, '0')}`,
        })),
        status: 'revised',
      }
    }

    return api.post<{
      script_id: number
      title: string
      scenes: Array<{ scene_number: number; content: string; timestamp?: string }>
      status: string
    }>(`/api/v1/video/${videoId}/scenario/revise`, {
      scene_revisions: sceneRevisions,
      general_notes: generalNotes,
    })
  },

  async approveCharacter(adId: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return approveCharacter(adId)
    }

    return api.post<{ message: string }>(`/api/v1/video/${adId}/character/approve`, { approved: true })
  },

  async reviseCharacter(adId: string, rejectionReason: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return requestCharacterRevision(adId)
    }

    return api.post<{ message: string }>(`/api/v1/video/${adId}/character/revise`, { revision_notes: rejectionReason })
  },

  async approveVoice(adId: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return approveVoice(adId)
    }

    return api.post<{ message: string }>(`/api/v1/video/${adId}/voice/approve`, { approved: true })
  },

  async reviseVoice(adId: string, rejectionReason: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return requestVoiceRevision(adId)
    }

    return api.post<{ message: string }>(`/api/v1/video/${adId}/voice/revise`, { revision_notes: rejectionReason })
  },

  async generateVideo(adId: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 2000))
      return { video_id: 1, status: 'completed', estimated_duration: 120 }
    }

    return api.post<{ video_id: number; status: string; estimated_duration: number }>(
      `/api/v1/video/${adId}/video/generate`, {}
    )
  },

  async reviseVideo(adId: string, sceneRevisions: Array<{ scene_number: number; video_notes: string }>) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 2000))
      return { video_id: 1, status: 'processing', estimated_duration: 120 }
    }

    return api.post<{ video_id: number; status: string; estimated_duration: number }>(
      `/api/v1/video/${adId}/video/revise`, { scene_revisions: sceneRevisions }
    )
  },

  // === 통합 콘텐츠 API ===

  async generateContent(adId: string, memeId?: number) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 2000))
      return { ad_id: parseInt(adId), status: 'content_generating' }
    }

    return api.post<{ ad_id: number; status: string }>(
      `/api/v1/video/${adId}/content/generate`, { meme_id: memeId }
    )
  },

  async reviseContent(
    adId: string,
    sceneRevisions: Array<{ scene_number: number; scenario_notes?: string; video_notes?: string }>,
    generalNotes?: string
  ) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 2000))
      return { ad_id: parseInt(adId), status: 'content_generating' }
    }

    return api.post<{ ad_id: number; status: string }>(
      `/api/v1/video/${adId}/content/revise`, {
        scene_revisions: sceneRevisions,
        general_notes: generalNotes,
      }
    )
  },

  async approveContent(adId: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return { status: 'completed', message: '최종 승인 완료', is_completed: true }
    }

    return api.post<{ status: string; message: string; is_completed: boolean }>(
      `/api/v1/video/${adId}/content/approve`, {}
    )
  },

  async retryGeneration(adId: string, characterImagePrompt: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 1000))
      return { ad_id: parseInt(adId), status: 'generating_character' }
    }

    return api.post<{ ad_id: number; status: string }>(
      `/api/v1/video/${adId}/character/generate`, { character_prompt: characterImagePrompt }
    )
  },

  // === 시나리오 버전 관리 ===

  async getScenarioVersions(adId: string): Promise<ScenarioVersion[]> {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return [
        {
          script_id: 2,
          ad_id: parseInt(adId),
          title: '수정된 시나리오',
          generation_type: 'revised',
          approval_status: 'pending',
          quality_check_passed: true,
          quality_issues: [],
          review_result: null,
          revision_notes: '대사를 더 자연스럽게 수정해주세요',
          created_at: new Date().toISOString(),
          scenes: [
            { scene_number: 1, content: '수정된 Hook 씬' },
            { scene_number: 2, content: '수정된 Body 씬 1' },
            { scene_number: 3, content: '수정된 Body 씬 2' },
            { scene_number: 4, content: '수정된 Close 씬' },
          ],
        },
        {
          script_id: 1,
          ad_id: parseInt(adId),
          title: '초기 시나리오',
          generation_type: 'initial',
          approval_status: 'rejected',
          quality_check_passed: true,
          quality_issues: [],
          review_result: null,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          scenes: [
            { scene_number: 1, content: '원본 Hook 씬' },
            { scene_number: 2, content: '원본 Body 씬 1' },
            { scene_number: 3, content: '원본 Body 씬 2' },
            { scene_number: 4, content: '원본 Close 씬' },
          ],
        },
      ]
    }

    const response = await api.get<{
      versions: Array<{
        version: number
        script_id: number
        title: string
        description?: string
        generation_type: string
        approval_status: string
        created_at: string
        is_latest: boolean
        scenes_count: number
        revision_notes?: string
        scenes?: Array<{ scene_number: number; dialogue: string; scene_type: string }>
      }>
      total: number
    }>(`/api/v1/video/${adId}/scenarios/versions`)

    // API 응답을 ScenarioVersion 타입으로 변환
    return response.versions.map(v => ({
      script_id: v.script_id,
      ad_id: parseInt(adId),
      title: v.title,
      generation_type: v.generation_type as 'initial' | 'regenerated' | 'revised',
      approval_status: v.approval_status as 'pending' | 'approved' | 'rejected',
      quality_check_passed: true,
      quality_issues: [],
      review_result: null,
      revision_notes: v.revision_notes,
      created_at: v.created_at,
      scenes: v.scenes?.map(s => ({
        scene_number: s.scene_number,
        content: s.dialogue,
      })),
    }))
  },

  async getScenarioByVersion(adId: string, scriptId: number): Promise<ScenarioVersion> {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return {
        script_id: scriptId,
        ad_id: parseInt(adId),
        title: '시나리오 제목',
        generation_type: 'initial',
        approval_status: 'approved',
        quality_check_passed: true,
        quality_issues: [],
        review_result: null,
        created_at: new Date().toISOString(),
        scenes: [
          { scene_number: 1, content: '대사 1' },
          { scene_number: 2, content: '대사 2' },
          { scene_number: 3, content: '대사 3' },
          { scene_number: 4, content: '대사 4' },
        ],
      }
    }

    const response = await api.get<{
      script_id: number
      ad_id: number
      meme_id: number
      title: string
      description?: string
      hashtags: string[]
      scenes: Array<{
        scene_key: string
        scene_number: number
        dialogue: string
        emotion: string
        action: string
        visual_description: string
        scene_type: string
        duration_seconds: number
      }>
      generation_type: string
      approval_status: string
      status: string
      created_at: string
      updated_at: string
      review_result?: Record<string, unknown>
      revision_notes?: string
    }>(`/api/v1/video/${adId}/scenarios/${scriptId}`)

    return {
      script_id: response.script_id,
      ad_id: response.ad_id,
      title: response.title,
      generation_type: response.generation_type as 'initial' | 'regenerated' | 'revised',
      approval_status: response.approval_status as 'pending' | 'approved' | 'rejected',
      quality_check_passed: true,
      quality_issues: [],
      review_result: response.review_result || null,
      revision_notes: response.revision_notes,
      created_at: response.created_at,
      scenes: response.scenes.map(s => ({
        scene_number: s.scene_number,
        content: s.dialogue,
      })),
    }
  },
}

// ============================================
// Status API
// ============================================

export const statusApi = {
  async getWorkflowStatus(videoId: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 200))
      const video = getVideoById(videoId)
      if (!video) return null
      return {
        execution_id: `exec_${videoId}`,
        ad_id: parseInt(videoId),
        status: video.status === 'completed' ? 'completed' : 'running',
        current_stage: video.status,
        progress_percentage: video.status === 'completed' ? 100 : 50,
        created_at: video.createdAt,
        completed_at: video.status === 'completed' ? video.createdAt : null,
        error_message: null,
      } as WorkflowStatusResponse
    }

    return api.get<WorkflowStatusResponse>(`/api/v1/status/${videoId}`)
  },

  async getWorkflowDetail(videoId: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 200))
      const video = getVideoById(videoId)
      if (!video) return null
      return {
        execution_id: `exec_${videoId}`,
        ad_id: parseInt(videoId),
        status: video.status === 'completed' ? 'completed' : 'running',
        current_stage: video.status,
        progress_percentage: video.status === 'completed' ? 100 : 50,
        created_at: video.createdAt,
        completed_at: video.status === 'completed' ? video.createdAt : null,
        error_message: null,
        stages: [
          { name: 'character_generating', status: 'completed', started_at: null, completed_at: null, error_message: null },
          { name: 'character_review', status: 'completed', started_at: null, completed_at: null, error_message: null },
          { name: 'voice_generating', status: 'running', started_at: null, completed_at: null, error_message: null },
        ],
      } as WorkflowDetailResponse
    }

    return api.get<WorkflowDetailResponse>(`/api/v1/status/${videoId}/detail`)
  },
}
