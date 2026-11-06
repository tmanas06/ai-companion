'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

export default function MemoriesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [pendingMemories, setPendingMemories] = useState<Memory[]>([]);
  const [activeTab, setActiveTab] = useState<'approved' | 'pending' | 'search'>('approved');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<MemoryFilters>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [editForm, setEditForm] = useState<Partial<Memory>>({});

  const loadMemories = useCallback(async () => {
    if (activeTab === 'pending') return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(20),
        ...(filters.companionId && { companion_id: filters.companionId }),
        ...(filters.memoryType && { memory_type: filters.memoryType }),
        ...(filters.consentStatus && { consent_status: filters.consentStatus }),
        ...(filters.includeSensitive && { include_sensitive: 'true' }),
      });
      const response = await fetch(`/api/memories?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setMemories(data.memories);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to load memories:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, page, filters]);

  useEffect(() => {
    if (!authLoading) {
      loadMemories();
      loadPendingConsent();
    }
  }, [authLoading, activeTab, page, filters, loadMemories]);

  async function loadPendingConsent() {
    try {
      const response = await fetch('/api/memories/pending-consent?page=1&page_size=20');
      if (response.ok) {
        const data = await response.json();
        setPendingMemories(data.memories);
      }
    } catch (err) {
      console.error('Failed to load pending consent:', err);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setActiveTab('search');
    setPage(1);
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        page: '1',
        page_size: '20',
        ...(filters.companionId && { companion_id: filters.companionId }),
        ...(filters.includeSensitive && { include_sensitive: 'true' }),
      });
      const response = await fetch(`/api/memories/search?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setMemories(data.memories);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApprove(memoryId: string) {
    try {
      const response = await fetch(`/api/memories/${memoryId}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      if (response.ok) {
        loadMemories();
        loadPendingConsent();
      } else {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to approve');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve');
    }
  }

  async function handleReject(memoryId: string) {
    if (!confirm('Are you sure you want to reject this memory? It will be deleted.')) return;
    try {
      const response = await fetch(`/api/memories/${memoryId}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deny' }),
      });
      if (response.ok) {
        loadPendingConsent();
      } else {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to reject');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reject');
    }
  }

  async function handleDelete(memoryId: string) {
    if (!confirm('Are you sure you want to delete this memory?')) return;
    try {
      const response = await fetch(`/api/memories/${memoryId}`, { method: 'DELETE' });
      if (response.ok) {
        loadMemories();
        loadPendingConsent();
      } else {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to delete');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  function startEdit(memory: Memory) {
    setEditingMemory(memory);
    setEditForm({
      content: memory.content,
      memory_type: memory.memory_type,
      category: memory.category || '',
      confidence: memory.confidence,
      is_sensitive: memory.is_sensitive,
    });
  }

  async function handleEditSave() {
    if (!editingMemory) return;
    try {
      const response = await fetch(`/api/memories/${editingMemory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (response.ok) {
        setEditingMemory(null);
        loadMemories();
      } else {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to update');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  function handleEditCancel() {
    setEditingMemory(null);
    setEditForm({});
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Memories</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Manage your companion's memories</p>
        </div>
        <button
          className="px-4 py-2 rounded-lg font-medium text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
          style={{ backgroundColor: 'rgb(14 165 233)' }}
        >
          <svg className="w-5 h-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Memory
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-4" aria-label="Memory tabs">
          <button
            onClick={() => { setActiveTab('approved'); setPage(1); }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'approved'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            Approved ({total})
          </button>
          <button
            onClick={() => { setActiveTab('pending'); setPage(1); }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'pending'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            Pending Consent ({pendingMemories.length})
          </button>
          <button
            onClick={() => { setActiveTab('search'); }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'search'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            Search
          </button>
        </nav>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4">
        <select
          value={filters.memoryType || ''}
          onChange={(e) => setFilters({ ...filters, memoryType: e.target.value || undefined })}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
        >
          <option value="">All Types</option>
          <option value="preference">Preference</option>
          <option value="fact">Fact</option>
          <option value="event">Event</option>
          <option value="relationship">Relationship</option>
          <option value="goal">Goal</option>
          <option value="correction">Correction</option>
        </select>
        <select
          value={filters.consentStatus || ''}
          onChange={(e) => setFilters({ ...filters, consentStatus: e.target.value || undefined })}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
        >
          <option value="">All Consent Status</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="denied">Denied</option>
          <option value="auto_approved">Auto Approved</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={filters.includeSensitive || false}
            onChange={(e) => setFilters({ ...filters, includeSensitive: e.target.checked })}
            className="rounded border-slate-300 dark:border-slate-600"
          />
          Include Sensitive
        </label>
      </div>

      {activeTab === 'search' && (
        <div className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search memories..."
              className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isLoading}
              className="px-4 py-2 rounded-lg font-medium text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'rgb(14 165 233)' }}
            >
              Search
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="text-left text-sm font-medium text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3">Content</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Consent</th>
                <th className="px-4 py-3">Sensitive</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {(activeTab === 'pending' ? pendingMemories : memories).map((memory) => (
                <tr key={memory.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    {editingMemory?.id === memory.id ? (
                      <textarea
                        value={editForm.content || ''}
                        onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                        rows={2}
                      />
                    ) : (
                      <div className="max-w-xs truncate text-sm text-slate-900 dark:text-white">
                        {memory.content}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingMemory?.id === memory.id ? (
                      <select
                        value={editForm.memory_type || ''}
                        onChange={(e) => setEditForm({ ...editForm, memory_type: e.target.value as Memory['memory_type'] })}
                        className="px-2 py-1 text-xs rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="preference">Preference</option>
                        <option value="fact">Fact</option>
                        <option value="event">Event</option>
                        <option value="relationship">Relationship</option>
                        <option value="goal">Goal</option>
                        <option value="correction">Correction</option>
                      </select>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {memory.memory_type}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                    {editingMemory?.id === memory.id ? (
                      <input
                        type="text"
                        value={editForm.category || ''}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        placeholder="Category"
                      />
                    ) : (
                      memory.category || '-'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                      {memory.source}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'px-2 py-1 text-xs rounded-full',
                      memory.consent_status === 'approved' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
                      memory.consent_status === 'pending' && 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
                      memory.consent_status === 'denied' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                      memory.consent_status === 'auto_approved' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                    )}>
                      {memory.consent_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {memory.is_sensitive ? (
                      <svg className="w-5 h-5 mx-auto text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 10.707a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L11 11.586l2.293-2.293a1 1 0 00-1.414-1.414L11 13.586l-2.293-2.293a1 1 0 00-1.414 1.414l-2 2a1 1 0 001.414 0l4 4a1 1 0 001.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 mx-auto text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L9 12.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {editingMemory?.id === memory.id ? (
                        <>
                          <button
                            onClick={handleEditSave}
                            className="p-2 text-green-500 hover:text-green-700 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30"
                            aria-label="Save"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={handleEditCancel}
                            className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Cancel"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <>
                          {activeTab === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(memory.id)}
                                className="p-2 text-green-500 hover:text-green-700 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30"
                                aria-label="Approve"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleReject(memory.id)}
                                className="p-2 text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
                                aria-label="Reject"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => startEdit(memory)}
                            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Edit"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(memory.id)}
                            className="p-2 text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
                            aria-label="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5.036 7H7m10 0v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7h14z" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {memories.length === 0 && activeTab !== 'search' && (
          <div className="p-12 text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <p className="text-lg font-medium text-slate-900 dark:text-white mb-2">No memories yet</p>
            <p className="text-slate-500 dark:text-slate-400">Memories will appear here as you chat with your companion</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Type definitions
interface Memory {
  id: string;
  user_id: string;
  companion_id: string;
  conversation_id: string | null;
  content: string;
  memory_type: 'preference' | 'fact' | 'event' | 'relationship' | 'goal' | 'correction';
  category: string | null;
  source: 'user_explicit' | 'user_correction' | 'model_inference' | 'conversation_summary';
  confidence: number;
  is_sensitive: boolean;
  consent_status: 'pending' | 'approved' | 'denied' | 'auto_approved';
  consent_requested_at: string | null;
  consent_granted_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  superseded_by: string | null;
}

interface MemoryFilters {
  companionId?: string;
  memoryType?: string;
  consentStatus?: string;
  includeSensitive?: boolean;
}