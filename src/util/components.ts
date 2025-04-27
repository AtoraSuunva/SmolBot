import type {
  ComponentType,
  ThumbnailComponent,
  TopLevelComponent,
} from 'discord.js'

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

export type StripArray<T> = T extends Array<infer U> ? U : T
