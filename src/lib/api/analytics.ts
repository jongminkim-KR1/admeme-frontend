import { api, MOCK_MODE } from './client'
import { mockData, memePerformanceData, categoryPerformanceData, trendData, hourlyViewsDistribution, analyticsSummary } from './mock'
import type {
  MemePerformanceResponse,
  CostStatisticsResponse,
  CompanyCostResponse,
  LowQualityVideoResponse,
  ValidationFailureResponse,
  PaginatedResponse,
  MemePerformance,
  CategoryPerformance,
  TrendDataPoint,
  TrendInsight,
  PaginatedMemePerformance,
  PaginatedCategoryPerformance,
  MemeSortBy,
  CategorySortBy,
  SortOrder,
} from '@/types'

// ============================================
// Insight Generation (조회수 중심)
// ============================================

export function generateInsights(
  memeData: MemePerformance[],
  categoryData: CategoryPerformance[],
  trends: TrendDataPoint[],
  summary: { viewsChange: number; totalViews: number }
): TrendInsight[] {
  const insights: TrendInsight[] = []

  // 1. 조회수 증감률 기반 인사이트
  if (summary.viewsChange > 30) {
    insights.push({
      type: 'positive',
      title: `조회수 ${summary.viewsChange}% 상승`,
      description: `지난 7일간 총 조회수가 ${summary.viewsChange}% 증가했습니다. 현재 추세가 매우 좋습니다.`,
    })
  } else if (summary.viewsChange > 10) {
    insights.push({
      type: 'positive',
      title: `조회수 ${summary.viewsChange}% 상승`,
      description: `지난 7일간 조회수가 안정적으로 증가하고 있습니다.`,
    })
  } else if (summary.viewsChange < -20) {
    insights.push({
      type: 'negative',
      title: '조회수 감소 주의',
      description: `지난 7일간 조회수가 ${Math.abs(summary.viewsChange)}% 감소했습니다. 콘텐츠 전략 점검이 필요합니다.`,
    })
  }

  // 2. 최고 성과 밈 (조회수 기준)
  if (memeData.length > 0) {
    const topMeme = [...memeData].sort((a, b) => b.avgViews - a.avgViews)[0]
    const avgViews = memeData.reduce((sum, m) => sum + m.avgViews, 0) / memeData.length
    const outperformance = Math.round(((topMeme.avgViews - avgViews) / avgViews) * 100)

    if (outperformance > 20) {
      insights.push({
        type: 'positive',
        title: `'${topMeme.label}' 밈 조회수 최고`,
        description: `평균 조회수 ${topMeme.avgViews.toLocaleString()}회로 전체 밈 평균 대비 ${outperformance}% 높습니다.`,
      })
    }

    // 최고 완료율 밈
    const topCompletionMeme = [...memeData].sort((a, b) => b.avgCompletionRate - a.avgCompletionRate)[0]
    if (topCompletionMeme.avgCompletionRate >= 80) {
      insights.push({
        type: 'positive',
        title: `'${topCompletionMeme.label}' 완료율 ${topCompletionMeme.avgCompletionRate}%`,
        description: `시청 완료율이 가장 높아 끝까지 시청하는 비율이 우수합니다.`,
      })
    }
  }

  // 3. 카테고리별 트렌드 분석
  const downCategories = categoryData.filter(c => c.trend === 'down')
  if (downCategories.length > 0) {
    const worstCategory = downCategories.sort((a, b) => a.avgViews - b.avgViews)[0]
    insights.push({
      type: 'negative',
      title: `'${worstCategory.category}' 조회수 하락`,
      description: `해당 카테고리의 조회수가 감소 추세입니다. 밈 유형 변경을 권장합니다.`,
    })
  }

  // 4. 시간대 분석 (hourlyViewsDistribution 기반)
  const peakHours = hourlyViewsDistribution
    .filter(h => h.percent >= 9)
    .map(h => h.hour)
  if (peakHours.length > 0) {
    const peakStart = Math.min(...peakHours)
    const peakEnd = Math.max(...peakHours)
    const peakPercent = hourlyViewsDistribution
      .filter(h => h.hour >= peakStart && h.hour <= peakEnd)
      .reduce((sum, h) => sum + h.percent, 0)

    insights.push({
      type: 'neutral',
      title: '조회수 피크 시간대',
      description: `${peakStart}시-${peakEnd + 1}시에 전체 조회의 ${Math.round(peakPercent)}%가 발생합니다. 이 시간대 업로드를 권장합니다.`,
    })
  }

  // 5. 일평균 조회수 계산
  const actualTrends = trends.filter(t => !t.predicted)
  if (actualTrends.length >= 14) {
    const recentWeek = actualTrends.slice(-7)
    const prevWeek = actualTrends.slice(-14, -7)
    const recentAvg = recentWeek.reduce((sum, t) => sum + t.views, 0) / 7
    const prevAvg = prevWeek.reduce((sum, t) => sum + t.views, 0) / 7
    const dailyGrowth = Math.round(((recentAvg - prevAvg) / prevAvg) * 100)

    if (dailyGrowth > 15) {
      insights.push({
        type: 'positive',
        title: '일평균 조회수 상승',
        description: `일평균 조회수가 ${prevAvg.toLocaleString()}회에서 ${recentAvg.toLocaleString()}회로 ${dailyGrowth}% 증가했습니다.`,
      })
    }
  }

  // 최대 5개만 반환
  return insights.slice(0, 5)
}

// ============================================
// Analytics API (Admin)
// ============================================

export const analyticsApi = {
  async getDashboard() {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return analyticsSummary
    }

    const response = await api.get<{
      period: { from: string; to: string }
      summary: {
        total_videos: number
        total_views: number
        average_engagement_rate: number
        total_companies: number
      }
      trends: {
        views_growth: number
        engagement_growth: number
      }
      top_category: string | null
      top_meme_type: string | null
    }>('/api/v1/admin/analytics/dashboard')
    return {
      totalVideos: response.summary?.total_videos || 0,
      totalViews: response.summary?.total_views || 0,
      avgEngagement: response.summary?.average_engagement_rate || 0,
      topCategory: response.top_category || '-',
      topMemeType: response.top_meme_type || 'unknown',
      viewsChange: response.trends?.views_growth || 0,
      engagementChange: response.trends?.engagement_growth || 0,
    }
  },

  async getMemePerformance(params?: {
    page?: number
    limit?: number
    sortBy?: MemeSortBy
    sortOrder?: SortOrder
    search?: string
  }): Promise<PaginatedMemePerformance> {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      let data = [...memePerformanceData]

      // 검색
      if (params?.search) {
        const searchLower = params.search.toLowerCase()
        data = data.filter(m => m.label.toLowerCase().includes(searchLower))
      }

      // 정렬
      if (params?.sortBy) {
        data.sort((a, b) => {
          const aVal = a[params.sortBy!]
          const bVal = b[params.sortBy!]
          return params.sortOrder === 'asc' ? aVal - bVal : bVal - aVal
        })
      }

      // 페이지네이션
      const page = params?.page || 1
      const limit = params?.limit || 10
      const start = (page - 1) * limit
      const total = data.length

      return {
        items: data.slice(start, start + limit),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      }
    }

    const queryParams = new URLSearchParams()
    if (params?.page) queryParams.append('page', String(params.page))
    if (params?.limit) queryParams.append('limit', String(params.limit))
    if (params?.sortBy) {
      const sortByMap: Record<string, string> = {
        'avgViews': 'views',
        'avgCompletionRate': 'completion_rate',
        'avgEngagementRate': 'engagement_rate',
        'videoCount': 'video_count',
        'totalViews': 'total_views',
      }
      queryParams.append('sort_by', sortByMap[params.sortBy] || params.sortBy)
    }
    if (params?.sortOrder) queryParams.append('sort_order', params.sortOrder)
    if (params?.search) queryParams.append('search', params.search)
    const query = queryParams.toString() ? `?${queryParams}` : ''

    const response = await api.get<{
      items: Array<{
        meme_id: number
        meme_name: string
        category: string
        usage_count: number
        total_views: number
        average_views_per_video: number
        average_engagement_rate: number
        average_view_duration: number
        top_performing_video: unknown
      }>
      total: number
      page: number
      total_pages: number
    }>(`/api/v1/admin/analytics/memes${query}`)

    return {
      items: (response.items || []).map(m => ({
        memeType: (m.category || 'quotable') as MemePerformance['memeType'],
        label: m.meme_name || '',
        videoCount: m.usage_count || 0,
        totalViews: m.total_views || 0,
        avgViews: m.average_views_per_video || 0,
        avgCompletionRate: 0,
        avgEngagementRate: m.average_engagement_rate || 0,
      })),
      total: response.total || response.items?.length || 0,
      page: response.page || 1,
      totalPages: response.total_pages || 1,
    }
  },

  // Top N 밈 가져오기 (차트용)
  async getTopMemes(limit = 10, sortBy: MemeSortBy = 'avgViews'): Promise<MemePerformance[]> {
    const result = await this.getMemePerformance({
      page: 1,
      limit,
      sortBy,
      sortOrder: 'desc',
    })
    return result.items
  },

  async getCategoryPerformance(params?: {
    page?: number
    limit?: number
    sortBy?: CategorySortBy
    sortOrder?: SortOrder
    search?: string
  }): Promise<PaginatedCategoryPerformance> {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      let data = [...categoryPerformanceData]

      // 검색
      if (params?.search) {
        const searchLower = params.search.toLowerCase()
        data = data.filter(c => c.category.toLowerCase().includes(searchLower))
      }

      // 정렬
      if (params?.sortBy) {
        data.sort((a, b) => {
          const aVal = a[params.sortBy!]
          const bVal = b[params.sortBy!]
          return params.sortOrder === 'asc' ? aVal - bVal : bVal - aVal
        })
      }

      // 페이지네이션
      const page = params?.page || 1
      const limit = params?.limit || 10
      const start = (page - 1) * limit
      const total = data.length

      return {
        items: data.slice(start, start + limit),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      }
    }

    const queryParams = new URLSearchParams()
    if (params?.page) queryParams.append('page', String(params.page))
    if (params?.limit) queryParams.append('limit', String(params.limit))
    if (params?.sortBy) {
      const sortByMap: Record<string, string> = {
        'avgViews': 'views',
        'avgCompletionRate': 'completion_rate',
        'avgEngagementRate': 'engagement_rate',
        'videoCount': 'video_count',
        'totalViews': 'total_views',
      }
      queryParams.append('sort_by', sortByMap[params.sortBy] || params.sortBy)
    }
    if (params?.sortOrder) queryParams.append('sort_order', params.sortOrder)
    if (params?.search) queryParams.append('search', params.search)
    const query = queryParams.toString() ? `?${queryParams}` : ''

    const response = await api.get<{
      period: { from: string; to: string }
      categories: Array<{
        category: string
        video_count: number
        total_views: number
        average_engagement_rate: number
        top_memes: Array<{ meme_name: string; usage_count: number; average_engagement_rate: number }>
      }>
      total: number
      page: number
      total_pages: number
    }>(`/api/v1/admin/analytics/categories${query}`)

    return {
      items: (response.categories || []).map(c => ({
        category: c.category || '',
        videoCount: c.video_count || 0,
        totalViews: c.total_views || 0,
        avgViews: Math.round((c.total_views || 0) / Math.max(c.video_count || 1, 1)),
        avgEngagementRate: c.average_engagement_rate || 0,
        topMemeType: (c.top_memes?.[0]?.meme_name || 'unknown') as CategoryPerformance['topMemeType'],
        trend: 'stable' as const,
      })),
      total: response.total || response.categories?.length || 0,
      page: response.page || 1,
      totalPages: response.total_pages || 1,
    }
  },

  // Top N 카테고리 가져오기 (차트용)
  async getTopCategories(limit = 10, sortBy: CategorySortBy = 'avgViews'): Promise<CategoryPerformance[]> {
    const result = await this.getCategoryPerformance({
      page: 1,
      limit,
      sortBy,
      sortOrder: 'desc',
    })
    return result.items
  },

  async getTrends(period: 'week' | 'month' | 'quarter' = 'month') {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      // 동적 인사이트 생성
      const insights = generateInsights(
        memePerformanceData,
        categoryPerformanceData,
        trendData,
        { viewsChange: analyticsSummary.viewsChange, totalViews: analyticsSummary.totalViews }
      )
      return { data: trendData, insights }
    }

    const response = await api.get<{
      period: { from: string; to: string }
      granularity: string
      metric: string
      data_points: Array<{ date: string; value: number; predicted?: boolean }>
      summary: { total: number; average: number }
      insights?: Array<{ type: string; title: string; description: string }>
    }>(`/api/v1/admin/analytics/trends?period=${period}`)

    return {
      data: (response.data_points || []).map(t => ({
        date: t.date,
        views: t.value || 0,
        engagement: 0,
        predicted: t.predicted || false,
      })),
      insights: (response.insights || []).map(i => ({
        type: i.type as 'positive' | 'negative' | 'neutral',
        title: i.title,
        description: i.description,
      })),
    }
  },

  async exportData(params: {
    report_type: 'dashboard' | 'memes' | 'categories' | 'companies' | 'videos'
    date_from: string
    date_to: string
    format: 'csv' | 'excel'
    include_details?: boolean
    filters?: {
      company_ids?: number[]
      meme_categories?: string[]
    }
  }) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return {
        export_id: 'export_' + Date.now(),
        status: 'processing',
        estimated_completion: new Date(Date.now() + 60000).toISOString(),
        message: '내보내기가 시작되었습니다',
      }
    }

    return api.post<{
      export_id: string
      status: string
      estimated_completion: string
      message: string
    }>('/api/v1/admin/analytics/export', params)
  },

  async getExportStatus(exportId: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return {
        export_id: exportId,
        status: 'completed',
        download_url: '/mock-export.csv',
        file_size_mb: 1.5,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date(Date.now() - 60000).toISOString(),
        completed_at: new Date().toISOString(),
      }
    }

    return api.get<{
      export_id: string
      status: string
      download_url?: string
      file_size_mb?: number
      expires_at?: string
      created_at: string
      completed_at?: string
    }>(`/api/v1/admin/analytics/export/${exportId}`)
  },

  async getCompanyPerformance(params?: {
    date_from?: string
    date_to?: string
  }) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return {
        period: {
          from_date: params?.date_from || '2026-01-01',
          to: params?.date_to || '2026-01-28',
        },
        companies: [
          {
            company_id: 1,
            company_name: '회사A',
            total_videos: 15,
            total_views: 45000,
            total_engagement: 2500,
            average_engagement_rate: 5.2,
            average_views_per_video: 3000,
            most_used_meme: '두둥탁',
            best_performing_video: { video_id: 1, title: '신제품 홍보', views: 8500, engagement_rate: 6.2 },
          },
          {
            company_id: 2,
            company_name: '회사B',
            total_videos: 10,
            total_views: 32000,
            total_engagement: 1800,
            average_engagement_rate: 4.8,
            average_views_per_video: 3200,
            most_used_meme: '어머 이건 사야해',
            best_performing_video: { video_id: 5, title: '할인 이벤트', views: 6200, engagement_rate: 5.5 },
          },
          {
            company_id: 3,
            company_name: '회사C',
            total_videos: 8,
            total_views: 28000,
            total_engagement: 1600,
            average_engagement_rate: 5.5,
            average_views_per_video: 3500,
            most_used_meme: '비포애프터',
            best_performing_video: { video_id: 10, title: '제품 리뷰', views: 5800, engagement_rate: 5.8 },
          },
        ],
        total_companies: 3,
      }
    }

    const queryParams = new URLSearchParams()
    if (params?.date_from) queryParams.append('date_from', params.date_from)
    if (params?.date_to) queryParams.append('date_to', params.date_to)
    const query = queryParams.toString() ? `?${queryParams}` : ''

    return api.get<{
      period: { from_date: string; to: string }
      companies: Array<{
        company_id: number
        company_name: string
        total_videos: number
        total_views: number
        total_engagement: number
        average_engagement_rate: number
        average_views_per_video: number
        most_used_meme: string
        best_performing_video: {
          video_id: number
          title: string
          views: number
          engagement_rate: number
        }
      }>
      total_companies: number
    }>(`/api/v1/admin/analytics/companies${query}`)
  },
}

// ============================================
// Client Analytics API
// ============================================

export interface ClientDashboardResponse {
  period: { from: string; to: string }
  summary: {
    total_projects: number
    completed_projects: number
    processing_projects: number
    total_videos: number
    published_videos: number
    total_views: number
    total_likes: number
    total_comments: number
    avg_engagement_rate: number
    total_cost_usd: number
    completion_rate: number
  }
  status_distribution: Record<string, number>
  views_timeline: { date: string; views: number }[]
  engagement_timeline: { date: string; engagement_rate: number }[]
  recent_videos: {
    video_id: number
    ad_id: number
    title: string
    status: string
    created_at: string
    views: number
    likes: number
    engagement_rate: number
  }[]
}

export interface VideoPerformanceResponse {
  video_id: number
  title: string
  status: string
  created_at: string
  duration_seconds: number | null
  latest_performance: {
    views: number
    likes: number
    dislikes: number
    comments: number
    shares: number
    engagement_rate: number
    watch_time_seconds: number
    average_view_duration: number
    captured_at: string | null
  }
  timeline: {
    captured_at: string
    views: number
    likes: number
    comments: number
    shares: number
    engagement_rate: number
  }[]
  hourly_views: {
    hour: number
    views: number
  }[]
}

export const clientAnalyticsApi = {
  async getDashboard(dateFrom?: string, dateTo?: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return {
        period: { from: '2026-01-01', to: '2026-01-26' },
        summary: {
          total_projects: 24,
          completed_projects: 18,
          processing_projects: 3,
          total_videos: 18,
          published_videos: 15,
          total_views: 125000,
          total_likes: 8500,
          total_comments: 1200,
          avg_engagement_rate: 4.2,
          total_cost_usd: 450.0,
          completion_rate: 75.0,
        },
        status_distribution: { completed: 18, processing: 3, pending: 2, failed: 1 },
        views_timeline: mockData.dailyStats.map((d) => ({ date: d.date, views: d.views })),
        engagement_timeline: mockData.dailyStats.map((d) => ({ date: d.date, engagement_rate: d.engagement })),
        recent_videos: mockData.videos.slice(0, 5).map((v) => ({
          video_id: parseInt(v.id),
          title: v.title,
          status: v.status,
          created_at: v.createdAt,
          views: v.views,
          likes: Math.floor(v.views * 0.05),
          engagement_rate: 4.2,
        })),
      } as ClientDashboardResponse
    }

    const params = new URLSearchParams()
    if (dateFrom) params.append('date_from', dateFrom)
    if (dateTo) params.append('date_to', dateTo)
    const query = params.toString() ? `?${params}` : ''
    return api.get<ClientDashboardResponse>(`/api/v1/analytics/dashboard${query}`)
  },

  async getVideoPerformance(videoId: number) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return {
        video_id: videoId,
        title: '테스트 영상',
        status: 'completed',
        created_at: '2026-01-15T00:00:00',
        duration_seconds: 60,
        latest_performance: {
          views: 5000,
          likes: 250,
          dislikes: 10,
          comments: 80,
          shares: 30,
          engagement_rate: 4.5,
          watch_time_seconds: 45,
          average_view_duration: 45,
          captured_at: '2026-01-26T00:00:00',
        },
        timeline: [],
        hourly_views: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          views: Math.floor(Math.random() * 500)
        }))
      } as VideoPerformanceResponse
    }

    return api.get<VideoPerformanceResponse>(`/api/v1/analytics/videos/${videoId}`)
  },

  async getSummary() {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 200))
      return {
        total_projects: 24,
        completed_projects: 18,
        total_videos: 18,
        total_cost_usd: 450.0,
      }
    }

    return api.get<{ total_projects: number; completed_projects: number; total_videos: number; total_cost_usd: number }>('/api/v1/analytics/summary')
  },

  // 사용자용 밈별 분석
  async getMyMemes() {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return memePerformanceData
    }

    const response = await api.get<Array<{
      meme_id: number
      meme_name: string
      meme_type: string
      video_count: number
      total_views: number
      avg_views: number
    }>>('/api/v1/analytics/memes')

    return response.map(m => ({
      memeType: m.meme_type as MemePerformance['memeType'],
      label: m.meme_name,
      videoCount: m.video_count,
      totalViews: m.total_views,
      avgViews: m.avg_views,
      avgCompletionRate: 0,
      avgEngagementRate: 0,
    }))
  },

  // 사용자용 카테고리별 분석
  async getMyCategories() {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return categoryPerformanceData
    }

    const response = await api.get<Array<{
      category: string
      video_count: number
      total_views: number
      avg_views: number
    }>>('/api/v1/analytics/categories')

    return response.map(c => ({
      category: c.category,
      videoCount: c.video_count,
      totalViews: c.total_views,
      avgViews: c.avg_views,
      avgEngagementRate: 0,
      topMemeType: 'unknown' as CategoryPerformance['topMemeType'],
      trend: 'stable' as const,
    }))
  },

  // 사용자용 트렌드 분석
  async getMyTrends() {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return { data: trendData, insights: [] }
    }

    const response = await api.get<{
      data: Array<{ date: string; views: number }>
      insights: Array<{ type: string; title: string; description: string }>
    }>('/api/v1/analytics/trends')

    return {
      data: response.data.map(t => ({
        date: t.date,
        views: t.views,
        engagement: 0,
        predicted: false,
      })),
      insights: response.insights.map(i => ({
        type: i.type as 'positive' | 'negative' | 'neutral',
        title: i.title,
        description: i.description,
      })),
    }
  },
}

// ============================================
// Costs API
// ============================================

export const costsApi = {
  async getCompanyCosts(year: number, month: number, page = 1, perPage = 10) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return {
        items: [
          { company_id: 1, company_name: '회사A', total_videos: 10, total_cost: 150000, avg_cost_per_video: 15000 },
          { company_id: 2, company_name: '회사B', total_videos: 5, total_cost: 80000, avg_cost_per_video: 16000 },
        ],
        total: 2,
        page,
        per_page: perPage,
        total_pages: 1,
      }
    }

    const offset = (page - 1) * perPage
    return api.get<PaginatedResponse<CompanyCostResponse>>(
      `/api/v1/admin/costs/companies?year=${year}&month=${month}&offset=${offset}&limit=${perPage}`
    )
  },

  async getStatistics() {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return {
        total_cost: 500000,
        avg_cost_per_video: 15000,
        cost_by_stage: { character: 3000, voice: 2000, scenario: 5000, video: 5000 },
        monthly_costs: [
          { month: '2026-01', cost: 500000 },
        ],
      }
    }

    return api.get<CostStatisticsResponse>('/api/v1/admin/costs/statistics')
  },

  async getOptimizationSuggestions() {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return [
        { type: 'cost', title: '비용 최적화', description: '캐릭터 생성 단계에서 배치 처리를 활용하면 20% 비용 절감 가능' },
      ]
    }

    return api.get<{ type: string; title: string; description: string }[]>('/api/v1/admin/costs/optimization-suggestions')
  },

  async getCostDetails(params?: {
    offset?: number
    limit?: number
  }) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return {
        total_count: 5,
        offset: params?.offset || 0,
        limit: params?.limit || 20,
        details: [
          { cost_id: 1, company_id: 1, company_name: '회사A', video_id: 1, video_title: '신제품 홍보 영상', cost_type: 'character', amount: 3000, details: { model: 'sd-xl' }, created_at: '2026-01-15T10:00:00' },
          { cost_id: 2, company_id: 1, company_name: '회사A', video_id: 1, video_title: '신제품 홍보 영상', cost_type: 'voice', amount: 2000, details: { model: 'elevenlabs' }, created_at: '2026-01-15T11:00:00' },
          { cost_id: 3, company_id: 1, company_name: '회사A', video_id: 1, video_title: '신제품 홍보 영상', cost_type: 'scenario', amount: 5000, details: { model: 'gpt-4' }, created_at: '2026-01-16T09:00:00' },
          { cost_id: 4, company_id: 1, company_name: '회사A', video_id: 1, video_title: '신제품 홍보 영상', cost_type: 'video', amount: 5000, details: { model: 'sora' }, created_at: '2026-01-17T14:00:00' },
          { cost_id: 5, company_id: 2, company_name: '회사B', video_id: 2, video_title: '이벤트 안내', cost_type: 'character', amount: 3000, details: { model: 'sd-xl' }, created_at: '2026-01-18T10:00:00' },
        ],
      }
    }

    const queryParams = new URLSearchParams()
    if (params?.offset !== undefined) queryParams.append('offset', String(params.offset))
    if (params?.limit !== undefined) queryParams.append('limit', String(params.limit))
    const query = queryParams.toString() ? `?${queryParams}` : ''

    return api.get<{
      total_count: number
      offset: number
      limit: number
      details: Array<{
        cost_id: number
        company_id: number
        company_name: string
        video_id: number
        video_title: string
        cost_type: string
        amount: number
        details: Record<string, unknown>
        created_at: string
      }>
    }>(`/api/v1/admin/costs/details${query}`)
  },
}

// ============================================
// Quality API
// ============================================

export const qualityApi = {
  async getLowQualityVideos(threshold: number, page = 1, perPage = 10) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return { items: [], total: 0, page, per_page: perPage, total_pages: 0 }
    }

    const offset = (page - 1) * perPage
    return api.get<PaginatedResponse<LowQualityVideoResponse>>(
      `/api/v1/admin/quality/low-score-videos?threshold=${threshold}&offset=${offset}&limit=${perPage}`
    )
  },

  async getValidationFailures(page = 1, perPage = 10) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return { items: [], total: 0, page, per_page: perPage, total_pages: 0 }
    }

    const offset = (page - 1) * perPage
    return api.get<PaginatedResponse<ValidationFailureResponse>>(`/api/v1/admin/quality/validation-failures?offset=${offset}&limit=${perPage}`)
  },

  async retryValidation(validationId: number, params?: {
    force_reprocess?: boolean
    skip_checks?: string[]
    note?: string
  }) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return {
        validation_id: validationId,
        video_id: 1,
        status: 'processing',
        retry_count: 1,
        message: '검증이 재시작되었습니다',
        estimated_completion: new Date(Date.now() + 300000).toISOString(),
      }
    }

    return api.post<{
      validation_id: number
      video_id: number
      status: string
      retry_count: number
      message: string
      estimated_completion: string
    }>(`/api/v1/admin/quality/validation/${validationId}/retry`, {
      force_reprocess: params?.force_reprocess ?? false,
      skip_checks: params?.skip_checks,
      note: params?.note,
    })
  },

  async getQualityTrends() {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return [
        { date: '2026-01-15', avg_quality_score: 85 },
        { date: '2026-01-16', avg_quality_score: 87 },
        { date: '2026-01-17', avg_quality_score: 86 },
      ]
    }

    return api.get<{ date: string; avg_quality_score: number }[]>('/api/v1/admin/quality/trends')
  },

  async approveValidation(validationId: number, params: {
    reason: string
    override_checks: string[]
  }) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return {
        validation_id: validationId,
        video_id: 1,
        status: 'approved',
        approved_by: 'admin',
        approved_at: new Date().toISOString(),
        message: '검증이 수동 승인되었습니다',
      }
    }

    return api.post<{
      validation_id: number
      video_id: number
      status: string
      approved_by: string
      approved_at: string
      message: string
    }>(`/api/v1/admin/quality/validation/${validationId}/approve`, params)
  },
}

// ============================================
// Final API (Video Approval/Download)
// ============================================

export const finalApi = {
  async downloadVideo(videoId: number) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return { download_url: '/mock-video.mp4' }
    }

    return api.get<{ download_url: string }>(`/api/v1/videos/${videoId}/download`)
  },

  async approveVideo(videoId: number, feedback?: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return { message: '영상이 최종 승인되었습니다' }
    }

    return api.post<{ message: string }>(`/api/v1/videos/${videoId}/approve`, { feedback })
  },

  async rejectVideo(videoId: number, reason: string, feedback?: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return { message: '영상이 거부되었습니다' }
    }

    return api.post<{ message: string }>(`/api/v1/videos/${videoId}/reject`, { reason, feedback })
  },

  async previewVideo(videoId: number) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 300))
      return { preview_url: 'https://placehold.co/1280x720/1a1a1a/c8ff00?text=Preview+Video' }
    }

    return api.get<{ preview_url: string }>(`/api/v1/videos/${videoId}/preview`)
  },

  async reviseVideo(videoId: number, feedback?: string) {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 500))
      return { message: '영상 재생성이 요청되었습니다', execution_id: 'exec_new_123' }
    }

    return api.post<{ message: string; execution_id?: string }>(`/api/v1/videos/${videoId}/revise`, {
      feedback,
    })
  },
}
