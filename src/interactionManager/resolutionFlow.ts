import { Flow } from './flow'
import { FlowType } from './types'
import { SDKError, ErrorCode } from '../errors'
import { last } from 'ramda'

import { ResolutionResult } from '../resolution'
import { JSONWebToken } from 'jolocom-lib/js/interactionTokens/JSONWebToken'

export enum ResolutionType {
  ResolutionRequest = 'ResolutionRequest',
  ResolutionResponse = 'ResolutionResponse',
}

export interface ResolutionRequest {
  description?: string
  uri?: string
  callbackURL?: string
}

export interface ResolutionFlowState {
  request?: ResolutionRequest
  resolution_result?: ResolutionResult
}

export const isResolutionRequest = (
  t: any,
  typ: string,
): t is ResolutionRequest => typ === ResolutionType.ResolutionRequest

export const isResolutionResponse = (
  t: any,
  typ: string,
): t is ResolutionResult => typ === ResolutionType.ResolutionResponse

export class ResolutionFlow extends Flow<ResolutionRequest | ResolutionResult> {
  public type = FlowType.Resolution
  public state: ResolutionFlowState = {}

  private async validateTokenAndPush(
    token: JSONWebToken<ResolutionRequest | ResolutionResult>,
  ) {
    try {
      await this.ctx.ctx.ctx.identityWallet.validateJWT(
        token,
        last(this.history),
        this.ctx.ctx.ctx.sdk.resolver,
      )
      this.history.push(token)
      return true
    } catch (err) {
      throw new SDKError(ErrorCode.InvalidToken, err)
    }
  }

  public async handleInteractionToken(
    token: JSONWebToken<ResolutionRequest | ResolutionResult>,
  ): Promise<boolean> {
    /*
     * Peer Resolution has some extra logic to be done prior to validation of the response
     *
     * the state must be updated, then used to verify, then confirmed or rolled back
     */
    const iT = token.interactionToken
    switch (token.interactionType) {
      case ResolutionType.ResolutionRequest:
        if (isResolutionRequest(iT, token.interactionType)) {
          await this.validateTokenAndPush(token)
          this.state.request = iT
          return true
        }
      case ResolutionType.ResolutionResponse:
        if (isResolutionResponse(iT, token.interactionType)) {
          // does the token contain state update information?
          if (
            iT.methodMetadata.stateProof &&
            iT.methodMetadata.stateProof.length > 0
          ) {
            // cache local state
            const id = last(token.signer.did.split(':')) || ''
            const cachedEL = await this.ctx.ctx.ctx.storage.eventDB.read(id)

            // update local state
            await this.ctx.ctx.ctx.sdk.didMethods
              .getForDid(iT.didDocument.id)
              .registrar.encounter(iT.methodMetadata.stateProof)

            // verify
            await this.validateTokenAndPush(token).catch(async err => {
              // failed, roll back
              await this.ctx.ctx.ctx.storage.eventDB.delete(id)
              await this.ctx.ctx.ctx.sdk.didMethods
                .getForDid(iT.didDocument.id)
                .registrar.encounter(cachedEL)
              throw err
            })
          } else {
            await this.validateTokenAndPush(token)
          }
          this.state.resolution_result = iT
          return true
        }
    }
    return false
  }

  public async onValidMessage(
    token: ResolutionRequest | ResolutionResult,
    interactionType: string,
  ) {
    return true
  }
}
