'use client';

import { useEffect, useState } from 'react';
import { fetchAdapter } from '@/adapters/fetchAdapter';
import { Link } from '@/components/ui/link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { NotFound } from '@/components/not-found';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'BLOCKED'>('ALL');

  useEffect(() => {
    async function fetchCustomers() {
      try {
        setLoading(true);
        let path = '/customers';
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (status !== 'ALL') params.set('status', status);
        if (params.toString()) {
          path += `?${params.toString()}`;
        }
        const { data } = await fetchAdapter<{ profiles: any[] }>({
          method: 'GET',
          path,
        });
        setCustomers(data.profiles);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load customers');
      } finally {
        setLoading(false);
      }
    }

    fetchCustomers();
  }, [search, status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold">Customers</h1>
        <div className="flex flex-col sm:flex-row sm:space-x-3 w-full sm:w-auto">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <label htmlFor="search" className="sr-only">
              Search
            </label>
            <input
              id="search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers..."
              className="input input-bordered w-full max-w-xs"
            />
          </div>
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <label htmlFor="status" className="sr-only">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="select select-bordered w-full max-w-xs"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          <div className="col-span-3"><Spinner /></div>
        </div>
      ) : error ? (
        <div className="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M7 20a10.016 10.016 12.001 14.001 1.006 0 0 15.261-7.029A10.02 10.02 0 0020.75 11a9.974 9.974 0.001 0-4.162-6.885 10.008 10.008 0 00-8.847 4.508A10.017 10.017 0 103 20z"/></svg>
          <span>{error}</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Bookings</th>
                <th>Value</th>
                <th>Tags</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.publicId}>
                  <td className="font-medium">{customer.displayName}</td>
                  <td>
                    {customer.displayPhone ? (
                      <>
                        <span title="Phone">{customer.displayPhone}</span><br />
                        {customer.displayEmail ? (
                          <span title="Email">{customer.displayEmail}</span>
                        ) : null}
                      </>
                    ) : customer.displayEmail ? (
                      <span title="Email">{customer.displayEmail}</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <span className={`badge ${customer.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {customer.status}
                    </span>
                  </td>
                  <td>{customer.bookingsCount}</td>
                  <td>{customer.totalSpent}</td>
                  <td>
                    {customer.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {customer.tags.map((tag: any) => (
                          <span key={tag.id} className="badge badge-outline" style={{ backgroundColor: tag.color }}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="justify-end">
                    <Link href={`/dashboard/clientes/${customer.publicId}`}>
                      <button className="btn btn-sm btn-outline">View</button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}