type AuthUser = {
  email?: string | null;
  id?: string | null;
  image?: string | null;
  name?: string | null;
};

type MutableAuthToken = {
  email?: string | null;
  id?: unknown;
  name?: string | null;
  picture?: string | null;
  sub?: string;
};

export function applyAuthenticatedUserToToken<T extends MutableAuthToken>(
  token: T,
  user?: AuthUser,
) {
  if (user?.id) {
    token.id = user.id;
    token.name = user.name;
    token.email = user.email;
    token.picture = user.image;

    return token;
  }

  const tokenId = typeof token.id === "string" ? token.id : token.sub;

  if (!tokenId) {
    return null;
  }

  token.id = tokenId;

  return token;
}
