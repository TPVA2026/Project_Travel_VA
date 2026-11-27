import { getTokenUser } from './authSession.js'
import {
  streamItineraryPipeline,
  PIPELINE_MAX_CANDIDATES,
} from './api.js'

const PLAN_KEY = 'tpva-ai-plan'
const REQUEST_KEY = 'tpva-travel-request'

let activeSession = null

export function getPipelineIdentity(request) {
  return JSON.stringify([
    request,
    sessionStorage.getItem('tpva-generation-id'),
    getTokenUser()?.id || null,
  ])
}

export function resetPipelineSession() {
  const previous = activeSession
  activeSession = null
  previous?.controller.abort()
}

export function getPipelineSession(request) {
  const key = getPipelineIdentity(request)

  return activeSession?.key === key
    ? activeSession
    : null
}

export function startPipelineSession(request) {
  const existing = getPipelineSession(request)

  if (existing?.loading) return existing

  resetPipelineSession()

  const session = {
    controller: new AbortController(),
    key: getPipelineIdentity(request),
    requestKey: JSON.stringify(request),
    pipeline: null,
    loading: true,
    error: null,
    progress: null,
    listeners: new Set(),
  }

  activeSession = session

  function publish() {
    if (
      activeSession !== session ||
      sessionStorage.getItem(REQUEST_KEY) !== session.requestKey ||
      getPipelineIdentity(request) !== session.key
    ) return

    if (
      session.pipeline &&
      sessionStorage.getItem(REQUEST_KEY) === session.requestKey &&
      getPipelineIdentity(request) === session.key
    ) {
      sessionStorage.setItem(
        PLAN_KEY,
        JSON.stringify({
          requestKey: session.requestKey,
          identity: session.key,
          pipeline: session.pipeline,
        })
      )
    }

    for (const listener of session.listeners) {
      listener(session)
    }
  }

  streamItineraryPipeline(request, {
    count: PIPELINE_MAX_CANDIDATES,
    signal: session.controller.signal,

    onEvent(event) {
      if (activeSession !== session) return

      if (event.type === 'progress') {
        session.progress = {
          candidateIndex: event.candidateIndex,
          requestedCount: event.requestedCount,
        }
      }

      if (event.type === 'candidate') {
        session.pipeline = {
          pipelineStatus: 'GENERATING',
          generator: 'ai',
          request,
          candidates: [
            ...(session.pipeline?.candidates || []),
            event.candidate,
          ],
          ranking: {
            ranked: [],
            unscored: [],
            excluded: [],
          },
          warnings: [],
        }
      }

      publish()
    },
  })
    .then((body) => {
      session.pipeline = body
    })
    .catch((error) => {
      session.error = error

      if (session.pipeline) {
        session.pipeline = {
          ...session.pipeline,
          pipelineStatus: 'PARTIAL',
          warnings: [
            {
              code: error.code || 'STREAM_ERROR',
              message: error.message,
            },
          ],
        }
      }
    })
    .finally(() => {
      session.loading = false
      session.progress = null
      publish()
    })

  return session
}

export function subscribePipelineSession(session, listener) {
  session.listeners.add(listener)
  listener(session)

  return () => session.listeners.delete(listener)
}
