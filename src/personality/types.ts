/**
 * Known personality trait keys.
 * These are the traits loaded from the `personality` table at startup.
 */
export type PersonalityTraitKey =
  | 'nome'
  | 'estilo_fala'
  | 'emojis'
  | 'girias'
  | 'opinioes'
  | 'interesses'
  | 'humor_atual'
  | 'topico_favorito_atual'
  | 'nivel_formalidade';

export interface PersonalityTrait {
  id: number;
  trait: string;
  value: string;
  updatedAt: Date;
}

/** A flat key → value map of all active personality traits. */
export type PersonalityMap = Record<string, string>;
