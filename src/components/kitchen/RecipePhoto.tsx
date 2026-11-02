import { useQuery } from "@tanstack/react-query";
import { ChefHat } from "lucide-react";
import { signedPhotoUrl } from "@/lib/kitchen";
import { cn } from "@/lib/utils";

export function RecipePhoto({ path, alt, className }: { path: string | null; alt: string; className?: string }) {
  const { data: url } = useQuery({
    queryKey: ["photo", path],
    queryFn: () => signedPhotoUrl(path!),
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
  });
  if (!path || !url) {
    return (
      <div className={cn("flex items-center justify-center bg-secondary text-muted-foreground", className)}>
        <ChefHat className="h-8 w-8" />
      </div>
    );
  }
  return <img src={url} alt={alt} className={cn("object-cover", className)} loading="lazy" />;
}
