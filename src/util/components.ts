import type {
  BaseMessageOptions,
  ComponentType,
  ThumbnailComponent,
  TopLevelComponent,
} from 'discord.js'
import type { Writeable } from './types.js'

export function getComponentsOfType<T extends ComponentType>(
  components: TopLevelOrChildComponent[],
  type: T,
): ComponentOfType<T>[] {
  const children: ComponentOfType<T>[] = []

  for (const component of components) {
    if (component.type === type) {
      children.push(component as ComponentOfType<T>)
    } else if ('components' in component && component.components) {
      children.push(...getComponentsOfType(component.components, type))
    }
  }

  return children
}

export function* iterateAllComponents(
  components: TopLevelOrChildComponent[],
): Generator<TopLevelOrChildComponent> {
  for (const component of components) {
    yield component

    if ('components' in component && component.components) {
      yield* iterateAllComponents(component.components)
    }
  }
}

type MessageComponents = Writeable<
  Exclude<BaseMessageOptions['components'], undefined>
>

type TopLevelOrChildrenMessageComponents = StripArray<
  TopLevelComponentChildren<MessageComponents[number]> | TopLevelComponent
>

/**
 * Maps over all components, including nested ones, and applies the provided function.
 *
 * Useful to transform components from an existing message without having to clone _everything_ manually
 * @param components The components to map over.
 * @param fn The function to apply to each component.
 * @returns A new array of components with the function applied.
 */
export function mapComponents(
  components: TopLevelOrChildComponent[],
  fn: (
    component: TopLevelOrChildComponent,
  ) => TopLevelOrChildrenMessageComponents,
): MessageComponents {
  return components.map((component) => {
    if ('components' in component && component.components) {
      ;(component as unknown as { components: MessageComponents }).components =
        mapComponents(component.components, fn)

      return component
    }
    return fn(component)
  }) as unknown as MessageComponents
}

export type TopLevelOrChildComponent = StripArray<
  TopLevelComponent[] | TopLevelComponentChildren
>

export type AnyComponent = TopLevelOrChildComponent | ThumbnailComponent

export type ComponentOfType<
  T extends ComponentType,
  C extends TopLevelOrChildComponent = TopLevelOrChildComponent,
> = C extends {
  type: T
}
  ? C
  : never

// Get every 'components' property in any TopLevelComponent
export type TopLevelComponentChildren<T = TopLevelComponent> = T extends {
  components?: infer U
}
  ? U
  : never

export type StripArray<T> = T extends (infer U)[]
  ? U
  : T extends ReadonlyArray<infer U>
    ? U
    : T
