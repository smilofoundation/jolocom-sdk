import { CredentialOfferFlow } from './credentialOfferFlow'
import { InteractionType } from 'jolocom-lib/js/interactionTokens/types'
import {
  JSONWebToken,
  JWTEncodable,
} from 'jolocom-lib/js/interactionTokens/JSONWebToken'
import { BackendMiddleware } from '../../backendMiddleware'
import {
  InteractionChannel,
  InteractionSummary,
  SignedCredentialWithMetadata,
  CredentialVerificationSummary,
  AuthenticationFlowState,
} from './types'
import { CredentialRequestFlow } from './credentialRequestFlow'
import { JolocomLib } from 'jolocom-lib'
import { CredentialMetadataSummary } from '../storage'
import { Flow } from './flow'
import { last } from 'ramda'
import { CredentialOfferRequest } from 'jolocom-lib/js/interactionTokens/credentialOfferRequest'
import { AuthenticationFlow } from './authenticationFlow'
import { CredentialRequest } from 'jolocom-lib/js/interactionTokens/credentialRequest'
import { CredentialsReceive } from 'jolocom-lib/js/interactionTokens/credentialsReceive'
import { Linking } from '../../polyfills/reactNative'
import { AppError, ErrorCode } from '../errors'
import { Authentication } from 'jolocom-lib/js/interactionTokens/authentication'
import { Identity } from 'jolocom-lib/js/identity/identity'
import { EncryptionFlow } from './encryptionFlow'
import { DecryptionFlow } from './decryptionFlow'
import { generateIdentitySummary } from '../../utils/generateIdentitySummary'
import { GenericFlow } from './genericFlow'
import { Generic } from 'jolocom-lib/js/interactionTokens/genericToken'
import { IGenericAttrs } from 'jolocom-lib/js/interactionTokens/interactionTokens.types'
import {
  CallType,
  EncryptionRequest,
  EncryptionResponse,
  DecryptionRequest,
  DecryptionResponse,
} from './rpc'
import { isEncryptionRequest, isDecryptionRequest } from './guards'

/***
 * - initiated by InteractionManager when an interaction starts
 * - handles the communication channel of the interaction
 * - holds the instance of the particular interaction (e.g. CredentialOffer, Authentication)
 */

const interactionFlowForMessage = {
  [InteractionType.CredentialOfferRequest]: CredentialOfferFlow,
  [InteractionType.CredentialRequest]: CredentialRequestFlow,
  [InteractionType.Authentication]: AuthenticationFlow,
  [InteractionType.Generic]: GenericFlow,
}

export class Interaction {
  private interactionMessages: JSONWebToken<JWTEncodable>[] = []
  public id: string
  public ctx: BackendMiddleware
  public flow: Flow

  // The channel through which the request (first token) came in
  public channel: InteractionChannel

  public participants!: {
    requester: Identity
    responder?: Identity
  }

  public constructor(
    ctx: BackendMiddleware,
    channel: InteractionChannel,
    id: string,
    interactionType: InteractionType,
  ) {
    this.ctx = ctx
    this.channel = channel
    this.id = id

    this.flow = new interactionFlowForMessage[interactionType](this)
  }

  public static async start(
    ctx: BackendMiddleware,
    channel: InteractionChannel,
    token: JSONWebToken<JWTEncodable>,
  ): Promise<Interaction> {
    const interaction = new Interaction(
      ctx,
      channel,
      token.nonce,
      token.interactionType,
    )

    if (token.interactionType === InteractionType.Generic) {
      if (isEncryptionRequest(token.payload.interactionToken!)) {
        interaction.flow = new EncryptionFlow(interaction)
      } else if (isDecryptionRequest(token.payload.interactionToken!)) {
        interaction.flow = new DecryptionFlow(interaction)
      }
    }

    await interaction.processInteractionToken(token)

    return interaction
  }

  public getMessages() {
    return this.interactionMessages
  }

  private findMessageByType(type: InteractionType) {
    return this.getMessages().find(
      ({ interactionType }) => interactionType === type,
    )
  }

  // TODO Try to write a respond function that collapses these
  public async createAuthenticationResponse() {
    const request = this.findMessageByType(
      InteractionType.Authentication,
    ) as JSONWebToken<Authentication>
    const { description } = this.getSummary().state as AuthenticationFlowState

    return this.ctx.identityWallet.create.interactionTokens.response.auth(
      {
        description,
        callbackURL: request.interactionToken.callbackURL,
      },
      await this.ctx.keyChainLib.getPassword(),
      request,
    )
  }

  public async createCredentialResponse(
    selectedCredentials: CredentialVerificationSummary[],
  ) {
    const request = this.findMessageByType(
      InteractionType.CredentialRequest,
    ) as JSONWebToken<CredentialRequest>

    const credentials = await Promise.all(
      selectedCredentials.map(
        async ({ id }) => (await this.getVerifiableCredential({ id }))[0],
      ),
    )

    return this.ctx.identityWallet.create.interactionTokens.response.share(
      {
        callbackURL: request.interactionToken.callbackURL,
        suppliedCredentials: credentials.map(c => c.toJSON()),
      },
      await this.ctx.keyChainLib.getPassword(),
      request,
    )
  }

  public async createCredentialOfferResponseToken(
    selectedOffering: SignedCredentialWithMetadata[],
  ) {
    const credentialOfferRequest = this.findMessageByType(
      InteractionType.CredentialOfferRequest,
    ) as JSONWebToken<CredentialOfferRequest>

    const credentialOfferResponseAttr = {
      callbackURL: credentialOfferRequest.interactionToken.callbackURL,
      selectedCredentials: selectedOffering.map(offer => ({
        type: offer.type,
      })),
    }

    return this.ctx.identityWallet.create.interactionTokens.response.offer(
      credentialOfferResponseAttr,
      await this.ctx.keyChainLib.getPassword(),
      credentialOfferRequest,
    )
  }

  public async createEncResponseToken(): Promise<
    JSONWebToken<EncryptionResponse>
  > {
    const encRequest = this.findMessageByType(
      InteractionType.Generic,
    ) as JSONWebToken<EncryptionRequest>

    return this.ctx.identityWallet.create.interactionTokens.response.generic(
      {
        callbackURL: encRequest.payload.interactionToken!.callbackURL,
        // @ts-ignore
        body: {
          result: await this.ctx.identityWallet
            .asymEncryptToDidKey(
              Buffer.from(
                encRequest.payload.interactionToken!.body.request.data,
                'base64',
              ),
              encRequest.payload.interactionToken!.body.request.target,
            )
            .then(buf => buf.toString('base64')),
          rpc: CallType.AsymEncrypt,
        },
      },
      await this.ctx.keyChainLib.getPassword(),
      encRequest,
    )
  }

  public async createDecResponseToken(): Promise<
    JSONWebToken<DecryptionResponse>
  > {
    const decRequest = this.findMessageByType(
      InteractionType.Generic,
    ) as JSONWebToken<DecryptionRequest>

    return this.ctx.identityWallet.create.interactionTokens.response.generic(
      {
        callbackURL: decRequest.payload.interactionToken!.callbackURL,
        body: {
          // @ts-ignore
          result: await this.ctx.identityWallet
            .asymDecrypt(
              Buffer.from(
                decRequest.payload.interactionToken!.body.request,
                'base64',
              ),
              {
                derivationPath: JolocomLib.KeyTypes.jolocomIdentityKey,
                encryptionPass: await this.ctx.keyChainLib.getPassword(),
              },
            )
            .then(buf => buf.toString('base64')),
          rpc: CallType.AsymDecrypt,
        },
      },
      await this.ctx.keyChainLib.getPassword(),
      decRequest,
    )
  }

  public async createGenericResponse<T, R>(body: IGenericAttrs<T>) {
    const genericRequest = this.findMessageByType(
      InteractionType.Generic,
    ) as JSONWebToken<Generic<R>>

    const genericResponse = {
      callbackURL: genericRequest.interactionToken.callbackURL,
      body,
    }

    return this.ctx.identityWallet.create.interactionTokens.response.generic(
      genericResponse,
      await this.ctx.keyChainLib.getPassword(),
      genericRequest,
    )
  }

  public async processInteractionToken(token: JSONWebToken<JWTEncodable>) {
    if (!this.participants) {
      // TODO what happens if the signer isnt resolvable
      const requester = await this.ctx.registry.resolve(token.signer.did)
      this.participants = {
        requester,
      }
      if (requester.did !== this.ctx.identityWallet.did) {
        this.participants.responder = this.ctx.identityWallet.identity
      }
    } else if (!this.participants.responder) {
      this.participants.responder = await this.ctx.registry.resolve(
        token.signer.did,
      )
    }

    if (token.signer.did !== this.ctx.identityWallet.did) {
      await this.ctx.identityWallet.validateJWT(
        token,
        last(this.getMessages()),
        this.ctx.registry,
      )
    }

    if (token.interactionType === InteractionType.CredentialsReceive) {
      await JolocomLib.util.validateDigestables(
        (token as JSONWebToken<CredentialsReceive>).interactionToken
          .signedCredentials,
      )
    }

    return this.flow
      .handleInteractionToken(token.interactionToken, token.interactionType)
      .then(res => {
        this.interactionMessages.push(token)
        // this.ctx.storageLib.store.interactionToken(token)
        return res
      })
  }

  public getSummary(): InteractionSummary {
    return {
      initiator: generateIdentitySummary(this.participants.requester),
      state: this.flow.getState(),
    }
  }

  public getAttributesByType = (type: string[]) => {
    return this.ctx.storageLib.get.attributesByType(type)
  }

  public async getStoredCredentialById(id: string) {
    return this.ctx.storageLib.get.verifiableCredential({
      id,
    })
  }

  public getVerifiableCredential = (query?: object) => {
    return this.ctx.storageLib.get.verifiableCredential(query)
  }

  /**
   * @dev This will crash with a credential receive because it doesn't contain a callbackURL
   * @todo This should probably come from the transport / channel handler
   * @todo Can this use the HttpAgent exported from instead of fetch? http.ts?
   * @todo The return type is difficult to pin down. If we're making a post, we expect a Response obejct,
   *   which either holds a token that can be parsed, or not (i.e. with credential responses, the answer from
   *   the server only holds the status code right now)
   *   If we're linking, the return value is a promise, as per {@see http://reactnative.dev/docs/linking.html#openurl}
   */

  public async send(token: JSONWebToken<JWTEncodable>) {
    // @ts-ignore - CredentialReceive has no callbackURL, needs fix on the lib for JWTEncodable.
    const { callbackURL } = token.interactionToken

    switch (this.channel) {
      case InteractionChannel.HTTP:
        const response = await fetch(callbackURL, {
          method: 'POST',
          body: JSON.stringify({ token: token.encode() }),
          headers: { 'Content-Type': 'application/json' },
        })

        if (!response.ok) {
          // TODO Error code for failed send?
          // TODO Actually include some info about the error
          throw new AppError(ErrorCode.Unknown)
        }

        const text = await response.text()

        if (text.length) {
          const { token } = JSON.parse(text)
          return JolocomLib.parse.interactionToken.fromJWT(token)
        }
        break

      case InteractionChannel.Deeplink:
        const callback = `${callbackURL}/${token.encode()}`
        if (!(await Linking.canOpenURL(callback))) {
          throw new AppError(ErrorCode.DeepLinkUrlNotFound)
        }

        return Linking.openURL(callback).then(() => {})
      default:
        throw new AppError(ErrorCode.TransportNotSupported)
    }
  }

  public async storeCredential(toSave: SignedCredentialWithMetadata[]) {
    return Promise.all(
      toSave.map(
        ({ signedCredential }) =>
          signedCredential &&
          this.ctx.storageLib.store.verifiableCredential(signedCredential),
      ),
    )
  }

  public storeCredentialMetadata = (metadata: CredentialMetadataSummary) =>
    this.ctx.storageLib.store.credentialMetadata(metadata)

  public storeIssuerProfile = () =>
    this.ctx.storageLib.store.issuerProfile(
      generateIdentitySummary(this.participants.requester),
    )
}
