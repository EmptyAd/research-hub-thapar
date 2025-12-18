import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/utils/supabaseClient";
import { useUserRole } from "@/hooks/useUserRole";
import { Skeleton } from "@/components/ui/skeleton";
import { Home } from "lucide-react";

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    inReview: 0,
    draft: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Admin Dashboard | ThaparAcad";
  }, []);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate("/");
      return;
    }

    const fetchStats = async () => {
      try {
        const { data: papers, error } = await supabase
          .from('research_papers')
          .select('status');

        if (error) throw error;

        const total = papers?.length || 0;
        const published = papers?.filter(p => p.status === 'published').length || 0;
        // Our create/edit uses 'under_review' everywhere
        const inReview = papers?.filter(p => p.status === 'under_review').length || 0;
        const draft = papers?.filter(p => p.status === 'draft').length || 0;

        setStats({ total, published, inReview, draft });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    if (!roleLoading && isAdmin) {
      fetchStats();
    }
  }, [isAdmin, roleLoading, navigate]);

  if (roleLoading || loading) {
    return (
      <main className="container mx-auto py-10">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Reporting Dashboard</h1>
          <p className="text-muted-foreground mt-2">Overview of all research papers and their status</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/")} className="gap-2">
          <Home className="h-4 w-4" />
          Back to Home
        </Button>
      </header>
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Total Papers</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-primary">{stats.total}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Published</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold" style={{ color: 'hsl(142 76% 36%)' }}>{stats.published}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>In Review</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-accent">{stats.inReview}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Draft</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-muted-foreground">{stats.draft}</CardContent>
        </Card>
      </section>
    </main>
  );
};

export default Admin;
