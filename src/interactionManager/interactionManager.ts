import { JSONWebToken } from 'jolocom-lib/js/interactionTokens/JSONWebToken'
import { Interaction } from './interaction'
import { Agent } from '../agent'
import { Flow } from './flow'
import { TransportAPI } from '../types'

/**
 * The {@link InteractionManager} is an entry point to dealing with {@link
 * Interaction}s. It also manages {@link InteractionTransport}s by extending
 * {@link Transportable}.  It is meant to be instantiated in context of a {@link
 * JolocomSDK} instance.
 *
 * Interactions are not serialized or fetched from storage, only the
 * interaction tokens ({@link JSONWebToken}). Currently the `InteractionManager`
 * holds a map of all interactions in memory, keyed by ID (which is just the
 * nonce of the first {@link JSONWebToken}).
 *
 *
 * @category Interactions
 */
export class InteractionManager{
  public readonly ctx: Agent

  public interactions: {
    [NONCE: string]: Interaction
  } = {}

  public constructor(ctx: Agent) {
    this.ctx = ctx
  }

  public async start<F extends Flow<any>>(
    token: JSONWebToken<any>,
    transportAPI?: TransportAPI
  ): Promise<Interaction<F>> {
    const interaction = new Interaction<F>(
      this,
      token.nonce,
      token.interactionType,
      transportAPI
    )
    this.interactions[token.nonce] = interaction
    await interaction.processInteractionToken(token)

    return interaction
  }

  // FIXME this can return UNDEFINED, should throw an error
  // FIXME need to be async to support storage backends
  public getInteraction<F extends Flow<any> = Flow<any>>(id: string) {
    return this.interactions[id] as Interaction<F>
  }
}
