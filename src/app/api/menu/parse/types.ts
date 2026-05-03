/**
 * Internal type representing a single menu item as returned by Claude Vision.
 * Not yet persisted — no id or menu_id.
 */
export interface ParsedMenuItem {
  name: string
  description?: string | null
  price: number
  category?: string | null
}
