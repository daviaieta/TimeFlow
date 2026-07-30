'use client';

import { useEffect, useState } from 'react';
import { fetchAdapter } from '@/adapters/fetchAdapter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

export default function TagsPage() {
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6'); // default blue
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    async function fetchTags() {
      try {
        setLoading(true);
        const { data } = await fetchAdapter<{ tags: any[] }>({
          method: 'GET',
          path: '/tags',
        });
        setTags(data.tags);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load tags');
      } finally {
        setLoading(false);
      }
    }

    fetchTags();
  }, []);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    setIsCreating(true);
    try {
      const { data } = await fetchAdapter<{ tag: any }>({
        method: 'POST',
        path: '/tags',
        body: { name: newTagName, color: newTagColor },
      });
      setTags(prev => [...prev, data.tag]);
      setNewTagName('');
      setNewTagColor('#3B82F6');
    } catch (err: any) {
      setError(err.message || 'Failed to create tag');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!window.confirm('Are you sure you want to delete this tag?')) return;
    try {
      await fetchAdapter({
        method: 'DELETE',
        path: `/tags/${tagId}`,
      });
      setTags(prev => prev.filter(tag => tag.id !== Number(tagId)));
    } catch (err: any) {
      setError(err.message || 'Failed to delete tag');
    }
  };

  if (loading) return <Spinner />;
  if (error) return <Alert variant="destructive">{error}</Alert>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold">Tags</h1>
        <div className="flex flex-col sm:flex-row sm:space-x-3 w-full sm:w-auto">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <label htmlFor="tag-name" className="sr-only">
              Tag name
            </label>
            <input
              id="tag-name"
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name"
              className="input input-bordered w-full max-w-xs"
              disabled={isCreating}
            />
          </div>
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <label htmlFor="tag-color" className="sr-only">
              Tag color
            </label>
            <input
              id="tag-color"
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              className="h-10 w-10 cursor-pointer"
              disabled={isCreating}
            />
          </div>
          <button
            onClick={handleCreateTag}
            className="btn btn-primary"
            disabled={isCreating || !newTagName.trim()}
          >
            {isCreating ? 'Creating...' : 'Create Tag'}
          </button>
        </div>
      </div>

      {tags.length === 0 ? (
        <p className="text-center text-muted-foreground">No tags yet.</p>
      ) : (
        <div className="space-y-4">
          {tags.map((tag) => (
            <div key={tag.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between border rounded-lg p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full sm:w-auto">
                <div className="flex items-center space-x-2">
                  <span
                    className="inline-block h-3 w-3 rounded"
                    style={{ backgroundColor: tag.color }}
                  ></span>
                  <span className="font-medium">{tag.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Created: {new Date(tag.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center space-x-2 mt-2 sm:mt-0">
                <button
                  onClick={() => handleDeleteTag(tag.id.toString())}
                  className="btn btn-error btn-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}