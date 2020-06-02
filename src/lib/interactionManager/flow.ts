import { Interaction } from './interaction'

export interface FlowState {}

export abstract class Flow<T> {
  protected ctx: Interaction
  public abstract state: FlowState

  constructor(ctx: Interaction) {
    this.ctx = ctx
  }

  abstract async handleInteractionToken(
    token: T,
    messageType: string,
  ): Promise<boolean>

  public getState() {
    return this.state
  }
}
