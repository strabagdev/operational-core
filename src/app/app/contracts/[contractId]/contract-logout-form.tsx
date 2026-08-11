"use client";

export function ContractLogoutForm({ className = "" }: { className?: string }) {
  return (
    <form action="/api/logout" method="post">
      <button
        className={`relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground ${className}`.trim()}
        type="submit"
      >
        Cerrar sesión
      </button>
    </form>
  );
}
