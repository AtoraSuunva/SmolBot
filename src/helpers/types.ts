/**
 * Forces Typescript to evaluate a type, generally providing a more useful type on hover
 *
 * @example
 * type TopLevelComponentChildren<T = TopLevelComponent> = T extends {
 *    components?: infer U;
 * } ? U extends (infer V)[] ? V extends unknown ? V[] : never : U : never
 *
 * // Hovering will show the full type as-written
 *
 * type Pretty = Prettify<TopLevelComponentChildren>
 * // Hovering will show `ButtonComponent[] | StringSelectMenuComponent[] | UserSelectMenuComponent[] | RoleSelectMenuComponent[] | ... 7 more ... | SectionComponent<...>[]`
 */
export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

/**
 * Removes the readonly modifier from all properties of a type.
 */
export type Writeable<T> = {
  -readonly [P in keyof T]: T[P]
}
