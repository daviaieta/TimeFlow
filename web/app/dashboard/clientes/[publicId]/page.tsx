'use client';

import { useEffect, useState } from 'react';
import { fetchAdapter } from '@/adapters/fetchAdapter';
import { Link } from '@/components/ui/link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { NotFound } from '@/components/not-found';
import { Badge } from '@/components/ui/badge';

export default function CustomerPage({ params }: { params: { publicId: string } }) {
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCustomer() {
      try {
        setLoading(true);
        const { data } = await fetchAdapter<{ profile: any }>({
          method: 'GET',
          path: `/customers/${params.publicId}`,
        });
        setCustomer(data.profile);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Customer not found');
      } finally {
        setLoading(false);
      }
    }

    if (params.publicId) {
      fetchCustomer();
    }
  }, [params.publicId]);

  if (loading) return <Spinner />;
  if (error) return <NotFound message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{customer.displayName}</h1>
        <div className="flex flex-col sm:flex-row sm:space-x-3">
          <Link href={`/dashboard/clientes/${customer.publicId}/notes`}>
            <button className="btn btn-primary">Notes</button>
          </Link>
          <Link href={`/dashboard/clientes/${customer.publicId}/bookings`}>
            <button className="btn btn-outline">Bookings</button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="font-semibold mb-2">Contact</h2>
          <p className="text-muted-foreground">
            {customer.displayPhone || 'No phone'}
          </p>
          {customer.displayEmail ? (
            <p className="text-muted-foreground">{customer.displayEmail}</p>
          ) : null}
        </div>
        <div>
          <h2 className="font-semibold mb-2">Details</h2>
          <p className="text-muted-foreground">
            Status:
            <Badge variant={customer.status === 'ACTIVE' ? 'secondary' : 'destructive'}>
              {customer.status}
            </Badge>
          </p>
          <p className="text-muted-foreground">
            Customer since: {new Date(customer.createdAt).toLocaleDateString()}
          </p>
          <p className="text-muted-foreground">
            Total spent: {customer.totalSpent}
          </p>
          <p className="text-muted-foreground">
            Number of bookings: {customer.bookingsCount}
          </p>
        </div>
      </div>

      <div className="border-t pt-4">
        <h2 className="font-semibold mb-2">Tags</h2>
        {customer.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {customer.tags.map((tag: any) => (
              <span key={tag.id} className="badge badge-outline" style={{ backgroundColor: tag.color }}>
                {tag.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No tags</p>
        )}
      </div>
    </div>
  );
}