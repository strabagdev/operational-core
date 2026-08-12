export type ContractNavigationItem = {
  href: string;
  label: string;
};

export function isContractNavigationItemActive({
  exact = false,
  href,
  pathname,
}: {
  exact?: boolean;
  href: string;
  pathname: string;
}) {
  if (exact) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
