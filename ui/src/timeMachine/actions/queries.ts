// Libraries
import {parse} from '@influxdata/flux-parser'

// API
import {
  runQuery,
  RunQueryResult,
  RunQuerySuccessResult,
} from 'src/shared/apis/query'
import {runStatusesQuery} from 'src/alerting/utils/statusEvents'

// Actions
import {notify} from 'src/shared/actions/notifications'

// Constants
import {rateLimitReached, resultTooLarge} from 'src/shared/copy/notifications'

// Utils
import {getActiveTimeMachine, getActiveQuery} from 'src/timeMachine/selectors'
import {checkQueryResult} from 'src/shared/utils/checkQueryResult'
import {getAllVariables, asAssignment} from 'src/variables/selectors'
import {getWindowVars} from 'src/variables/utils/getWindowVars'
import {buildVarsOption} from 'src/variables/utils/buildVarsOption'

// Types
import {CancelBox} from 'src/types/promises'
import {GetState, RemoteDataState, StatusRow} from 'src/types'

// Selectors
import {getOrg} from 'src/organizations/selectors'

export type Action = SaveDraftQueriesAction | SetQueryResults

interface SetQueryResults {
  type: 'SET_QUERY_RESULTS'
  payload: {
    status: RemoteDataState
    files?: string[]
    fetchDuration?: number
    errorMessage?: string
    statuses?: StatusRow[][]
  }
}

const setQueryResults = (
  status: RemoteDataState,
  files?: string[],
  fetchDuration?: number,
  errorMessage?: string,
  statuses?: StatusRow[][]
): SetQueryResults => ({
  type: 'SET_QUERY_RESULTS',
  payload: {
    status,
    files,
    fetchDuration,
    errorMessage,
    statuses,
  },
})

let pendingResults: Array<CancelBox<RunQueryResult>> = []
let pendingCheckStatuses: CancelBox<StatusRow[][]> = null

export const executeQueries = () => async (dispatch, getState: GetState) => {
  const state = getState()
  const timeMachine = getActiveTimeMachine(state)
  const queries = timeMachine.view.properties.queries.filter(
    ({text}) => !!text.trim()
  )
  const {
    alertBuilder: {id: checkID},
  } = state

  if (!queries.length) {
    dispatch(setQueryResults(RemoteDataState.Done, [], null))
  }

  try {
    dispatch(setQueryResults(RemoteDataState.Loading, [], null))

    const variableAssignments = getAllVariables(
      state,
      state.timeMachines.activeTimeMachineID
    ).map(v => asAssignment(v))

    // keeping getState() here ensures that the state we are working with
    // is the most current one. By having this set to state, we were creating a race
    // condition that was causing the following bug:
    // https://github.com/influxdata/idpe/issues/6240
    const orgID = getOrg(state).id

    const startTime = Date.now()

    pendingResults.forEach(({cancel}) => cancel())

    pendingResults = queries.map(({text}) => {
      const windowVars = getWindowVars(text, variableAssignments)
      const extern = buildVarsOption([...variableAssignments, ...windowVars])

      return runQuery(orgID, text, extern)
    })

    const results = await Promise.all(pendingResults.map(r => r.promise))
    const duration = Date.now() - startTime

    let statuses = [[]] as StatusRow[][]
    if (checkID) {
      const extern = buildVarsOption(variableAssignments)
      pendingCheckStatuses = runStatusesQuery(orgID, checkID, extern)
      statuses = await pendingCheckStatuses.promise
    }

    for (const result of results) {
      if (result.type === 'UNKNOWN_ERROR') {
        throw new Error(result.message)
      }

      if (result.type === 'RATE_LIMIT_ERROR') {
        dispatch(notify(rateLimitReached(result.retryAfter)))

        throw new Error(result.message)
      }

      if (result.didTruncate) {
        dispatch(notify(resultTooLarge(result.bytesRead)))
      }

      checkQueryResult(result.csv)
    }

    const files = (results as RunQuerySuccessResult[]).map(r => r.csv)
    dispatch(
      setQueryResults(RemoteDataState.Done, files, duration, null, statuses)
    )
  } catch (e) {
    if (e.name === 'CancellationError') {
      return
    }

    console.error(e)
    dispatch(setQueryResults(RemoteDataState.Error, null, null, e.message))
  }
}

interface SaveDraftQueriesAction {
  type: 'SAVE_DRAFT_QUERIES'
}

const saveDraftQueries = (): SaveDraftQueriesAction => ({
  type: 'SAVE_DRAFT_QUERIES',
})

export const saveAndExecuteQueries = () => dispatch => {
  dispatch(saveDraftQueries())
  dispatch(executeQueries())
}

export const executeCheckQuery = () => async (dispatch, getState: GetState) => {
  const state = getState()
  const {text} = getActiveQuery(state)
  const {id: orgID} = getOrg(state)

  if (text == '') {
    dispatch(setQueryResults(RemoteDataState.Done, [], null))
  }

  try {
    dispatch(setQueryResults(RemoteDataState.Loading, null, null, null))

    const startTime = Date.now()

    const extern = parse(
      'import "influxdata/influxdb/monitor"\noption monitor.write = yield'
    )

    const result = await runQuery(orgID, text, extern).promise
    const duration = Date.now() - startTime

    if (result.type === 'UNKNOWN_ERROR') {
      throw new Error(result.message)
    }

    if (result.type === 'RATE_LIMIT_ERROR') {
      dispatch(notify(rateLimitReached(result.retryAfter)))

      throw new Error(result.message)
    }

    if (result.didTruncate) {
      dispatch(notify(resultTooLarge(result.bytesRead)))
    }

    checkQueryResult(result.csv)

    const file = result.csv

    dispatch(setQueryResults(RemoteDataState.Done, [file], duration, null))
  } catch (e) {
    if (e.name === 'CancellationError') {
      return
    }

    console.error(e)
    dispatch(setQueryResults(RemoteDataState.Error, null, null, e.message))
  }
}
