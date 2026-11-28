'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  FolderPlus,
  FolderOpen,
  Truck,
  Plus,
  Search,
  X,
  MoreVertical,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  RotateCcw,
  Upload,
  Link2,
  ExternalLink,
  Download,
  Copy,
  Check,
  Pencil,
  Trash2,
  Eye,
  Database,
  AlertTriangle,
  Loader2,
  Calendar,
  FolderInput,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { KpiDashboardBar } from './KpiDashboardBar';
import { KpiCardDefinition } from '@/lib/kpiManager';
import {
  applyCardOrder,
  CARD_ORDER_CHANGE_EVENT,
  getStoredCardOrder,
  moveItemInArray,
  resetStoredCardOrder,
  saveStoredCardOrder,
} from '@/lib/cardOrder';
import { CustomDatePicker } from './CustomDatePicker';
import { REFRESH_MODULE_EVENT } from '@/lib/headerEvents';

export interface DocumentCategoryRecord {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  created_at?: string;
}

export interface DocumentRecord {
  id: string;
  folder_key: string;
  folder_type: 'vehicle' | 'category';
  title: string;
  doc_type: string;
  source_type: 'drive_link' | 'pdf';
  drive_url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_data: string;
  expiry_date: string;
  notes: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

interface DocVehicleSummary {
  id: string;
  registrationNumber: string;
  makeModel?: string;
  vehicleType?: string;
  capacity?: string;
  status: string;
}

interface FolderCardItem {
  folderKey: string;
  folderType: 'vehicle' | 'category';
  title: string;
  subtitle: string;
  badge: string;
  categoryRecord?: DocumentCategoryRecord;
  vehicleRecord?: DocVehicleSummary;
}

const DOC_TYPE_OPTIONS = [
  'RC Book',
  'Insurance Policy',
  'Fitness Certificate (FC)',
  'State Permit',
  'National Permit',
  'Pollution (PUC)',
  'Road Tax Receipt',
  'Driver License',
  'Company Agreement',
  'Invoice / Bill Copy',
  'Other',
];

const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8 MB

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getExpiryStatus(expiryStr?: string): {
  label: string;
  tone: 'none' | 'valid' | 'soon' | 'expired';
} {
  if (!expiryStr || !expiryStr.trim()) return { label: '', tone: 'none' };
  const parts = expiryStr.trim().split('-');
  if (parts.length !== 3) return { label: expiryStr, tone: 'none' };
  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy) return { label: expiryStr, tone: 'none' };
  const expDate = new Date(yyyy, mm - 1, dd);
  if (isNaN(expDate.getTime())) return { label: expiryStr, tone: 'none' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `Expired (${expiryStr})`, tone: 'expired' };
  if (diffDays <= 30) return { label: `Expiring in ${diffDays}d (${expiryStr})`, tone: 'soon' };
  return { label: `Valid till ${expiryStr}`, tone: 'valid' };
}

export function DocumentsManager() {
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [vehicles, setVehicles] = useState<DocVehicleSummary[]>([]);
  const [customCategories, setCustomCategories] = useState<DocumentCategoryRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);

  // Card ordering & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [draggedCardKey, setDraggedCardKey] = useState<string | null>(null);
  const [dragOverCardKey, setDragOverCardKey] = useState<string | null>(null);
  const [, setOrderTick] = useState(0);
  const [activeCardMenuKey, setActiveCardMenuKey] = useState<string | null>(null);

  // Active opened folder card
  const [selectedFolderKey, setSelectedFolderKey] = useState<string | null>(null);
  const [folderSearch, setFolderSearch] = useState('');
  const [folderTypeFilter, setFolderTypeFilter] = useState<'all' | 'pdf' | 'drive_link'>('all');

  // Category modal (Add / Rename / Edit)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<DocumentCategoryRecord | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState('');

  // Delete category modal
  const [deletingCategory, setDeletingCategory] = useState<DocumentCategoryRecord | null>(null);

  // Document modal (Add / Update)
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentRecord | null>(null);
  const [docFolderKey, setDocFolderKey] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState(DOC_TYPE_OPTIONS[0]);
  const [docSourceType, setDocSourceType] = useState<'drive_link' | 'pdf'>('drive_link');
  const [docDriveUrl, setDocDriveUrl] = useState('');
  const [docFileName, setDocFileName] = useState('');
  const [docFileSize, setDocFileSize] = useState(0);
  const [docMimeType, setDocMimeType] = useState('');
  const [docFileData, setDocFileData] = useState('');
  const [docExpiryDate, setDocExpiryDate] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docSaving, setDocSaving] = useState(false);
  const [docError, setDocError] = useState('');

  // Quick Rename Document modal
  const [renamingDoc, setRenamingDoc] = useState<DocumentRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Move Document modal
  const [movingDoc, setMovingDoc] = useState<DocumentRecord | null>(null);
  const [moveTargetFolderKey, setMoveTargetFolderKey] = useState('');

  // Delete Document modal
  const [deletingDoc, setDeletingDoc] = useState<DocumentRecord | null>(null);

  // PDF Preview modal & Copy feedback
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchAllFromSupabase = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      const supabase = createClient();
      const [vRes, cRes, dRes] = await Promise.all([
        supabase.from('vehicles').select('*').order('registration_number', { ascending: true }),
        supabase.from('document_categories').select('*').order('sort_order', { ascending: true }),
        supabase.from('documents').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      ]);

      if (vRes.error) {
        setDbError(`vehicles: ${vRes.error.message}`);
      } else if (vRes.data) {
        setVehicles(
          vRes.data.map((v: any) => ({
            id: v.id,
            registrationNumber: (v.registration_number || '').trim().toUpperCase(),
            makeModel: v.make_model || '',
            vehicleType: v.vehicle_type || '',
            capacity: v.capacity || '',
            status: v.status || 'active',
          }))
        );
      }

      if (cRes.error || dRes.error) {
        setSchemaMissing(true);
        setCustomCategories([]);
        setDocuments([]);
      } else {
        setSchemaMissing(false);
        setCustomCategories(
          (cRes.data || []).map((c: any) => ({
            id: c.id,
            name: c.name || '',
            description: c.description || '',
            sort_order: Number(c.sort_order) || 0,
            created_at: c.created_at,
          }))
        );
        setDocuments(
          (dRes.data || []).map((d: any) => ({
            id: d.id,
            folder_key: d.folder_key,
            folder_type: d.folder_type || 'vehicle',
            title: d.title || '',
            doc_type: d.doc_type || 'Other',
            source_type: d.source_type || 'drive_link',
            drive_url: d.drive_url || '',
            file_name: d.file_name || '',
            file_size: Number(d.file_size) || 0,
            mime_type: d.mime_type || '',
            file_data: d.file_data || '',
            expiry_date: d.expiry_date || '',
            notes: d.notes || '',
            sort_order: Number(d.sort_order) || 0,
            created_at: d.created_at,
            updated_at: d.updated_at,
          }))
        );
      }
    } catch (err: any) {
      setDbError(err?.message || 'Failed to load documents from database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllFromSupabase();
  }, [fetchAllFromSupabase]);

  useEffect(() => {
    const handleRefresh = (e: any) => {
      if (!e.detail || e.detail.module === 'documents' || e.detail.module === 'all') {
        fetchAllFromSupabase();
      }
    };
    const handleOrderChange = (e: any) => {
      if (e.detail?.category === 'documents') {
        setOrderTick((t) => t + 1);
      }
    };
    window.addEventListener(REFRESH_MODULE_EVENT as any, handleRefresh);
    window.addEventListener(CARD_ORDER_CHANGE_EVENT as any, handleOrderChange);
    return () => {
      window.removeEventListener(REFRESH_MODULE_EVENT as any, handleRefresh);
      window.removeEventListener(CARD_ORDER_CHANGE_EVENT as any, handleOrderChange);
    };
  }, [fetchAllFromSupabase]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.doc-card-menu')) {
        setActiveCardMenuKey(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Build combined folder cards (1 card per vehicle in DB + custom categories), ordered via cardOrder.ts
  const allFolderCards: FolderCardItem[] = useMemo(() => {
    const vehCards: FolderCardItem[] = vehicles.map((v) => ({
      folderKey: `veh:${v.registrationNumber}`,
      folderType: 'vehicle',
      title: v.registrationNumber,
      subtitle: [v.vehicleType, v.makeModel, v.capacity].filter(Boolean).join(' - ') || 'Vehicle Document Vault',
      badge: 'Vehicle',
      vehicleRecord: v,
    }));

    const catCards: FolderCardItem[] = customCategories.map((c) => ({
      folderKey: `cat:${c.id}`,
      folderType: 'category',
      title: c.name,
      subtitle: c.description || 'Custom Document Category',
      badge: 'Category',
      categoryRecord: c,
    }));

    return applyCardOrder([...vehCards, ...catCards], (item) => item.folderKey, 'documents');
  }, [vehicles, customCategories]);

  // Index documents by folderKey
  const docsByFolder = useMemo(() => {
    const map = new Map<string, DocumentRecord[]>();
    for (const d of documents) {
      const arr = map.get(d.folder_key) || [];
      arr.push(d);
      map.set(d.folder_key, arr);
    }
    return map;
  }, [documents]);

  const filteredFolderCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allFolderCards;
    return allFolderCards.filter((card) => {
      if (card.title.toLowerCase().includes(q) || card.subtitle.toLowerCase().includes(q)) return true;
      const folderDocs = docsByFolder.get(card.folderKey) || [];
      return folderDocs.some(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.doc_type.toLowerCase().includes(q) ||
          d.file_name.toLowerCase().includes(q)
      );
    });
  }, [allFolderCards, docsByFolder, searchQuery]);

  const selectedFolder = useMemo(
    () => allFolderCards.find((c) => c.folderKey === selectedFolderKey) || null,
    [allFolderCards, selectedFolderKey]
  );

  const selectedFolderDocs = useMemo(() => {
    if (!selectedFolderKey) return [];
    const list = docsByFolder.get(selectedFolderKey) || [];
    const q = folderSearch.trim().toLowerCase();
    return list.filter((d) => {
      if (folderTypeFilter !== 'all' && d.source_type !== folderTypeFilter) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.doc_type.toLowerCase().includes(q) ||
        d.file_name.toLowerCase().includes(q) ||
        d.notes.toLowerCase().includes(q)
      );
    });
  }, [docsByFolder, selectedFolderKey, folderSearch, folderTypeFilter]);

  // Dynamic KPI definitions
  const docKpiCards: KpiCardDefinition[] = useMemo(() => {
    const pdfCount = documents.filter((d) => d.source_type === 'pdf').length;
    const driveCount = documents.filter((d) => d.source_type === 'drive_link').length;
    const alertCount = documents.filter((d) => {
      const st = getExpiryStatus(d.expiry_date).tone;
      return st === 'expired' || st === 'soon';
    }).length;

    return [
      {
        key: 'total_vehicles',
        title: 'Vehicle Folders',
        value: String(vehicles.length),
        subtitle: 'Synced from vehicles DB',
        icon: 'truck',
        color: 'blue',
      },
      {
        key: 'custom_categories',
        title: 'Custom Categories',
        value: String(customCategories.length),
        subtitle: 'User-created folders',
        icon: 'clipboard',
        color: 'purple',
      },
      {
        key: 'total_docs',
        title: 'Total Documents',
        value: String(documents.length),
        subtitle: 'Across all folders',
        icon: 'fileText',
        color: 'emerald',
      },
      {
        key: 'pdf_docs',
        title: 'PDF Uploads',
        value: String(pdfCount),
        subtitle: 'Stored PDF files',
        icon: 'fileText',
        color: 'indigo',
      },
      {
        key: 'drive_links',
        title: 'Google Drive Links',
        value: String(driveCount),
        subtitle: 'Linked cloud documents',
        icon: 'activity',
        color: 'cyan',
      },
      {
        key: 'expiring_docs',
        title: 'Expiring / Expired',
        value: String(alertCount),
        subtitle: 'Within 30 days or past',
        icon: 'clock',
        color: alertCount > 0 ? 'rose' : 'slate',
      },
    ];
  }, [vehicles.length, customCategories.length, documents]);

  // Card Reordering Handlers
  const handleReorderCards = (sourceKey: string, targetKey: string) => {
    const currentKeys = allFolderCards.map((c) => c.folderKey);
    const fromIdx = currentKeys.indexOf(sourceKey);
    const toIdx = currentKeys.indexOf(targetKey);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const nextOrder = moveItemInArray(currentKeys, fromIdx, toIdx);
    saveStoredCardOrder('documents', nextOrder);
    setOrderTick((t) => t + 1);
  };

  const handleMoveCard = (folderKey: string, direction: 'up' | 'down') => {
    const currentKeys = allFolderCards.map((c) => c.folderKey);
    const idx = currentKeys.indexOf(folderKey);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentKeys.length) return;
    const nextOrder = moveItemInArray(currentKeys, idx, targetIdx);
    saveStoredCardOrder('documents', nextOrder);
    setOrderTick((t) => t + 1);
  };

  // Save Custom Category (Add or Rename/Update)
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError('');
    const cleanName = catName.trim();
    if (!cleanName) {
      setCatError('Please enter a category name.');
      return;
    }

    setCatSaving(true);
    try {
      const supabase = createClient();
      if (editingCategory) {
        const { error } = await supabase
          .from('document_categories')
          .update({
            name: cleanName,
            description: catDesc.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingCategory.id);
        if (error) {
          setCatError(error.message);
          return;
        }
      } else {
        const { error } = await supabase.from('document_categories').insert([
          {
            name: cleanName,
            description: catDesc.trim(),
            sort_order: customCategories.length + 1,
          },
        ]);
        if (error) {
          setCatError(`${error.message}. Run Section 19 of supabase/schema.sql first.`);
          return;
        }
      }
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
      setCatName('');
      setCatDesc('');
      await fetchAllFromSupabase();
    } catch (err: any) {
      setCatError(err?.message || 'Failed to save category.');
    } finally {
      setCatSaving(false);
    }
  };

  // Delete Custom Category
  const handleConfirmDeleteCategory = async () => {
    if (!deletingCategory) return;
    try {
      const supabase = createClient();
      const folderKey = `cat:${deletingCategory.id}`;
      await supabase.from('documents').delete().eq('folder_key', folderKey);
      const { error } = await supabase.from('document_categories').delete().eq('id', deletingCategory.id);
      if (error) {
        setDbError(error.message);
      } else {
        if (selectedFolderKey === folderKey) setSelectedFolderKey(null);
        await fetchAllFromSupabase();
      }
    } catch (err: any) {
      setDbError(err?.message || 'Error deleting category.');
    } finally {
      setDeletingCategory(null);
    }
  };

  // Open Upload / Edit Document modal
  const openAddDocModal = (folderKey: string) => {
    setEditingDoc(null);
    setDocFolderKey(folderKey);
    setDocTitle('');
    setDocType(DOC_TYPE_OPTIONS[0]);
    setDocSourceType('drive_link');
    setDocDriveUrl('');
    setDocFileName('');
    setDocFileSize(0);
    setDocMimeType('');
    setDocFileData('');
    setDocExpiryDate('');
    setDocNotes('');
    setDocError('');
    setIsDocModalOpen(true);
  };

  const openEditDocModal = (doc: DocumentRecord) => {
    setEditingDoc(doc);
    setDocFolderKey(doc.folder_key);
    setDocTitle(doc.title);
    setDocType(doc.doc_type || 'Other');
    setDocSourceType(doc.source_type);
    setDocDriveUrl(doc.drive_url || '');
    setDocFileName(doc.file_name || '');
    setDocFileSize(doc.file_size || 0);
    setDocMimeType(doc.mime_type || '');
    setDocFileData(doc.file_data || '');
    setDocExpiryDate(doc.expiry_date || '');
    setDocNotes(doc.notes || '');
    setDocError('');
    setIsDocModalOpen(true);
  };

  // Read PDF file from device
  const handlePdfFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDocError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setDocError('Please select a valid PDF (.pdf) file.');
      return;
    }

    if (file.size > MAX_PDF_BYTES) {
      setDocError(`PDF exceeds ${formatBytes(MAX_PDF_BYTES)} limit. Use a Google Drive link for larger files.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setDocFileData(result);
      setDocFileName(file.name);
      setDocFileSize(file.size);
      setDocMimeType(file.type || 'application/pdf');
      if (!docTitle.trim()) {
        setDocTitle(file.name.replace(/\.pdf$/i, ''));
      }
    };
    reader.onerror = () => {
      setDocError('Failed to read the selected PDF file.');
    };
    reader.readAsDataURL(file);
  };

  // Save Document (Add or Update)
  const handleSaveDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setDocError('');
    const cleanTitle = docTitle.trim();
    if (!cleanTitle) {
      setDocError('Please enter a document name.');
      return;
    }

    if (docSourceType === 'drive_link') {
      const url = docDriveUrl.trim();
      if (!url) {
        setDocError('Please paste the Google Drive link or document URL.');
        return;
      }
      if (!/^https?:\/\//i.test(url)) {
        setDocError('URL must start with https:// or http://');
        return;
      }
    } else if (!docFileData) {
      setDocError('Please upload a PDF file.');
      return;
    }

    const folderType: 'vehicle' | 'category' = docFolderKey.startsWith('cat:') ? 'category' : 'vehicle';

    setDocSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        folder_key: docFolderKey,
        folder_type: folderType,
        title: cleanTitle,
        doc_type: docType,
        source_type: docSourceType,
        drive_url: docSourceType === 'drive_link' ? docDriveUrl.trim() : '',
        file_name: docSourceType === 'pdf' ? docFileName : '',
        file_size: docSourceType === 'pdf' ? docFileSize : 0,
        mime_type: docSourceType === 'pdf' ? docMimeType || 'application/pdf' : '',
        file_data: docSourceType === 'pdf' ? docFileData : '',
        expiry_date: docExpiryDate.trim(),
        notes: docNotes.trim(),
        updated_at: new Date().toISOString(),
      };

      if (editingDoc) {
        const { error } = await supabase.from('documents').update(payload).eq('id', editingDoc.id);
        if (error) {
          setDocError(error.message);
          return;
        }
      } else {
        const existingCount = (docsByFolder.get(docFolderKey) || []).length;
        const { error } = await supabase.from('documents').insert([
          {
            ...payload,
            sort_order: existingCount + 1,
          },
        ]);
        if (error) {
          setDocError(`${error.message}. Run Section 19 of supabase/schema.sql first.`);
          return;
        }
      }

      setIsDocModalOpen(false);
      setEditingDoc(null);
      await fetchAllFromSupabase();
    } catch (err: any) {
      setDocError(err?.message || 'Failed to save document.');
    } finally {
      setDocSaving(false);
    }
  };

  // Rename Document
  const handleConfirmRenameDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingDoc || !renameValue.trim()) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('documents')
        .update({ title: renameValue.trim(), updated_at: new Date().toISOString() })
        .eq('id', renamingDoc.id);
      if (error) setDbError(error.message);
      else await fetchAllFromSupabase();
    } finally {
      setRenamingDoc(null);
      setRenameValue('');
    }
  };

  // Move Document to Another Folder
  const handleConfirmMoveDoc = async () => {
    if (!movingDoc || !moveTargetFolderKey) return;
    const targetType: 'vehicle' | 'category' = moveTargetFolderKey.startsWith('cat:') ? 'category' : 'vehicle';
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('documents')
        .update({
          folder_key: moveTargetFolderKey,
          folder_type: targetType,
          updated_at: new Date().toISOString(),
        })
        .eq('id', movingDoc.id);
      if (error) setDbError(error.message);
      else await fetchAllFromSupabase();
    } finally {
      setMovingDoc(null);
      setMoveTargetFolderKey('');
    }
  };

  // Delete Document
  const handleConfirmDeleteDoc = async () => {
    if (!deletingDoc) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from('documents').delete().eq('id', deletingDoc.id);
      if (error) setDbError(error.message);
      else await fetchAllFromSupabase();
    } finally {
      setDeletingDoc(null);
    }
  };

  // Reorder document inside folder
  const handleMoveDocumentOrder = async (doc: DocumentRecord, direction: 'up' | 'down') => {
    const list = docsByFolder.get(doc.folder_key) || [];
    const idx = list.findIndex((d) => d.id === doc.id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return;

    const reordered = moveItemInArray(list, idx, targetIdx);
    const supabase = createClient();
    await Promise.all(
      reordered.map((item, i) =>
        supabase.from('documents').update({ sort_order: i + 1 }).eq('id', item.id)
      )
    );
    await fetchAllFromSupabase();
  };

  const handleCopyDriveLink = async (doc: DocumentRecord) => {
    if (!doc.drive_url) return;
    try {
      await navigator.clipboard.writeText(doc.drive_url);
      setCopiedId(doc.id);
      setTimeout(() => setCopiedId((prev) => (prev === doc.id ? null : prev)), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const handleDownloadPdf = (doc: DocumentRecord) => {
    if (!doc.file_data) return;
    const a = document.createElement('a');
    a.href = doc.file_data;
    a.download = doc.file_name || `${doc.title}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-2.5 border-b border-gray-200 dark:border-zinc-800">
        <div className="min-w-0">
          <h2 className="text-[clamp(1.15rem,2.2vw,1.5rem)] font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="truncate">Documents Vault</span>
          </h2>
          <p className="text-[11px] sm:text-xs md:text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
            Vehicle document folders, custom categories, Google Drive links, and PDF uploads backed by Supabase
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {!selectedFolder && (
            <>
              <button
                type="button"
                onClick={() => setIsReorderMode((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                  isReorderMode
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                    : 'bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 border-gray-300 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>{isReorderMode ? 'Done Reordering' : 'Reorder Cards'}</span>
              </button>

              {getStoredCardOrder('documents').length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    resetStoredCardOrder('documents');
                    setOrderTick((t) => t + 1);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-950/40 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}

              <div className="relative w-full sm:w-60">
                <Search className="w-4 h-4 text-gray-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search folders or documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100 text-xs sm:text-sm font-medium focus:outline-none focus:border-blue-600"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingCategory(null);
              setCatName('');
              setCatDesc('');
              setCatError('');
              setIsCategoryModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <FolderPlus className="w-4 h-4" />
            <span>New Category</span>
          </button>
        </div>
      </div>

      {/* Schema notice */}
      {schemaMissing && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
          <Database className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Database Tables Setup Required for Documents</p>
            <p className="mt-0.5">
              Run Section 19 from <span className="font-mono font-semibold">supabase/schema.sql</span> in your Supabase SQL Editor to enable saving custom categories, Google Drive links, and PDF uploads.
            </p>
          </div>
        </div>
      )}

      {dbError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{dbError}</span>
        </div>
      )}

      {/* KPI Dashboard Bar */}
      <KpiDashboardBar
        category="documents"
        availableCards={docKpiCards}
        defaultKeys={['total_vehicles', 'custom_categories', 'total_docs', 'expiring_docs']}
      />

      {loading ? (
        <div className="p-16 text-center text-gray-500 dark:text-zinc-400 flex items-center justify-center gap-2.5">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span className="text-sm font-semibold">Loading document folders...</span>
        </div>
      ) : selectedFolder ? (
        /* ========================= INSIDE SELECTED FOLDER VIEW ========================= */
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-4">
          {/* Folder Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-200 dark:border-zinc-800">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedFolderKey(null);
                  setFolderSearch('');
                  setFolderTypeFilter('all');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 text-xs font-bold text-gray-700 dark:text-zinc-200 cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All Folders</span>
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[clamp(1.05rem,2vw,1.35rem)] font-extrabold font-mono text-gray-900 dark:text-white truncate">
                    {selectedFolder.title}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      selectedFolder.folderType === 'vehicle'
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                    }`}
                  >
                    {selectedFolder.badge}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                  {selectedFolder.subtitle}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openAddDocModal(selectedFolder.folderKey)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Upload / Add Document</span>
              </button>
            </div>
          </div>

          {/* Folder Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={folderSearch}
                onChange={(e) => setFolderSearch(e.target.value)}
                placeholder="Search document name, type, filename, notes..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/50 text-xs sm:text-sm font-medium text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-blue-600"
              />
              {folderSearch && (
                <button
                  type="button"
                  onClick={() => setFolderSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {[
                { id: 'all', label: 'All' },
                { id: 'pdf', label: 'PDFs' },
                { id: 'drive_link', label: 'Drive Links' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFolderTypeFilter(t.id as 'all' | 'pdf' | 'drive_link')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    folderTypeFilter === t.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Documents List Table */}
          {selectedFolderDocs.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-gray-300 dark:border-zinc-700 rounded-2xl">
              <FolderOpen className="w-10 h-10 text-gray-300 dark:text-zinc-600 mx-auto mb-2.5" />
              <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">
                No documents in this folder yet
              </p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 mb-3">
                Upload PDF files or attach Google Drive links for {selectedFolder.title}.
              </p>
              <button
                type="button"
                onClick={() => openAddDocModal(selectedFolder.folderKey)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Add First Document</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-100 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-zinc-300">
                    <th className="py-2.5 px-3 text-left">Document</th>
                    <th className="py-2.5 px-3 text-left">Type</th>
                    <th className="py-2.5 px-3 text-left">Source</th>
                    <th className="py-2.5 px-3 text-left">Expiry</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-zinc-800">
                  {selectedFolderDocs.map((doc, idx) => {
                    const expStatus = getExpiryStatus(doc.expiry_date);
                    return (
                      <tr key={doc.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-950/15">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-gray-900 dark:text-zinc-100 text-xs sm:text-sm">
                            {doc.title}
                          </div>
                          {doc.source_type === 'pdf' && doc.file_name && (
                            <div className="text-[11px] text-gray-500 dark:text-zinc-400 font-mono">
                              {doc.file_name} ({formatBytes(doc.file_size)})
                            </div>
                          )}
                          {doc.source_type === 'drive_link' && doc.drive_url && (
                            <div className="text-[11px] text-blue-600 dark:text-blue-400 truncate max-w-[clamp(140px,28vw,320px)]">
                              {doc.drive_url}
                            </div>
                          )}
                          {doc.notes && (
                            <div className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5 truncate max-w-[clamp(140px,28vw,320px)]">
                              {doc.notes}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300">
                            {doc.doc_type}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {doc.source_type === 'pdf' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                              <FileText className="w-3 h-3" />
                              <span>PDF File</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300">
                              <Link2 className="w-3 h-3" />
                              <span>Drive Link</span>
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {expStatus.tone === 'none' ? (
                            <span className="text-gray-400 dark:text-zinc-500">-</span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                expStatus.tone === 'expired'
                                  ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                                  : expStatus.tone === 'soon'
                                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              <Calendar className="w-3 h-3" />
                              <span>{expStatus.label}</span>
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            {doc.source_type === 'pdf' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc(doc)}
                                  title="Preview PDF"
                                  className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadPdf(doc)}
                                  title="Download PDF"
                                  className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <a
                                  href={doc.drive_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open Google Drive Link"
                                  className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 inline-flex items-center"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleCopyDriveLink(doc)}
                                  title="Copy Link"
                                  className="p-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 cursor-pointer"
                                >
                                  {copiedId === doc.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setRenamingDoc(doc);
                                setRenameValue(doc.title);
                              }}
                              title="Rename document"
                              className="p-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-200 hover:bg-gray-200 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditDocModal(doc)}
                              title="Edit / Update document"
                              className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 text-[11px] font-bold cursor-pointer"
                            >
                              Update
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setMovingDoc(doc);
                                setMoveTargetFolderKey(doc.folder_key);
                              }}
                              title="Move to another card"
                              className="p-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-200 hover:bg-gray-200 cursor-pointer"
                            >
                              <FolderInput className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveDocumentOrder(doc, 'up')}
                              title="Move up"
                              className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              disabled={idx === selectedFolderDocs.length - 1}
                              onClick={() => handleMoveDocumentOrder(doc, 'down')}
                              title="Move down"
                              className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeletingDoc(doc)}
                              title="Delete document"
                              className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 hover:bg-red-100 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ========================= FOLDER CARDS GRID VIEW ========================= */
        <>
          {isReorderMode && (
            <div className="px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4" />
                <span>Reorder Mode: Drag cards or use arrows to arrange Vehicle and Custom Category cards.</span>
              </div>
              <button
                type="button"
                onClick={() => setIsReorderMode(false)}
                className="font-bold underline cursor-pointer"
              >
                Done
              </button>
            </div>
          )}

          {filteredFolderCards.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl">
              <FolderOpen className="w-10 h-10 text-gray-300 dark:text-zinc-600 mx-auto mb-2.5" />
              <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">No document folders found</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                Add vehicles in the Vehicles category or click &quot;New Category&quot; to create a custom document folder.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredFolderCards.map((card, index) => {
                const folderDocs = docsByFolder.get(card.folderKey) || [];
                const pdfCount = folderDocs.filter((d) => d.source_type === 'pdf').length;
                const driveCount = folderDocs.filter((d) => d.source_type === 'drive_link').length;
                const expAlerts = folderDocs.filter((d) => {
                  const tone = getExpiryStatus(d.expiry_date).tone;
                  return tone === 'expired' || tone === 'soon';
                }).length;

                return (
                  <div
                    key={card.folderKey}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', card.folderKey);
                      setDraggedCardKey(card.folderKey);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedCardKey && draggedCardKey !== card.folderKey) {
                        setDragOverCardKey(card.folderKey);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverCardKey === card.folderKey) setDragOverCardKey(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const src = e.dataTransfer.getData('text/plain') || draggedCardKey;
                      if (src && src !== card.folderKey) {
                        handleReorderCards(src, card.folderKey);
                      }
                      setDraggedCardKey(null);
                      setDragOverCardKey(null);
                    }}
                    onClick={() => setSelectedFolderKey(card.folderKey)}
                    className={`bg-white dark:bg-zinc-900 border rounded-2xl p-3.5 sm:p-5 shadow-xs transition-all flex flex-col justify-between relative group cursor-pointer min-w-0 ${
                      draggedCardKey === card.folderKey
                        ? 'opacity-40 border-blue-400 scale-[0.99]'
                        : dragOverCardKey === card.folderKey
                        ? 'border-blue-500 ring-2 ring-blue-500/40 scale-[1.01]'
                        : 'border-gray-200 dark:border-zinc-800 hover:border-blue-400 dark:hover:border-blue-600'
                    }`}
                  >
                    {/* Card Top */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-500 dark:text-zinc-600 shrink-0" />
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                            card.folderType === 'vehicle'
                              ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400'
                              : 'bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-900 text-purple-600 dark:text-purple-400'
                          }`}
                        >
                          {card.folderType === 'vehicle' ? <Truck className="w-5 h-5" /> : <FolderOpen className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-[clamp(1rem,1.8vw,1.2rem)] font-extrabold font-mono text-gray-900 dark:text-zinc-100 truncate">
                              {card.title}
                            </h3>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">{card.subtitle}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {isReorderMode && (
                          <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-zinc-800 p-1 rounded-xl border border-gray-200 dark:border-zinc-700">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => handleMoveCard(card.folderKey, 'up')}
                              className="p-1 rounded-lg text-gray-600 dark:text-zinc-300 disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[10px] font-mono font-bold px-1">{index + 1}</span>
                            <button
                              type="button"
                              disabled={index === allFolderCards.length - 1}
                              onClick={() => handleMoveCard(card.folderKey, 'down')}
                              className="p-1 rounded-lg text-gray-600 dark:text-zinc-300 disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="relative doc-card-menu">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveCardMenuKey(activeCardMenuKey === card.folderKey ? null : card.folderKey)
                            }
                            className="w-8 h-8 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-600 dark:text-zinc-300 flex items-center justify-center cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {activeCardMenuKey === card.folderKey && (
                            <div className="absolute right-0 top-full mt-1.5 w-52 max-w-[calc(100vw-2rem)] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl z-30 p-1.5 space-y-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveCardMenuKey(null);
                                  setSelectedFolderKey(card.folderKey);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg cursor-pointer text-left"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
                                <span>Open Folder</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveCardMenuKey(null);
                                  openAddDocModal(card.folderKey);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg cursor-pointer text-left"
                              >
                                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Upload Document</span>
                              </button>

                              {card.categoryRecord && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveCardMenuKey(null);
                                      setEditingCategory(card.categoryRecord!);
                                      setCatName(card.categoryRecord!.name);
                                      setCatDesc(card.categoryRecord!.description);
                                      setCatError('');
                                      setIsCategoryModalOpen(true);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer text-left"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Rename / Edit Category</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveCardMenuKey(null);
                                      setDeletingCategory(card.categoryRecord!);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg cursor-pointer text-left"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete Category</span>
                                  </button>
                                </>
                              )}

                              <div className="pt-1 mt-1 border-t border-gray-100 dark:border-zinc-800">
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={() => {
                                    handleMoveCard(card.folderKey, 'up');
                                    setActiveCardMenuKey(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg disabled:opacity-40 cursor-pointer text-left"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                  <span>Move Earlier</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={index === allFolderCards.length - 1}
                                  onClick={() => {
                                    handleMoveCard(card.folderKey, 'down');
                                    setActiveCardMenuKey(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg disabled:opacity-40 cursor-pointer text-left"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                  <span>Move Later</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Preview of recent docs inside card */}
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 font-bold text-gray-700 dark:text-zinc-300">
                            {folderDocs.length} {folderDocs.length === 1 ? 'doc' : 'docs'}
                          </span>
                          {pdfCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold">
                              {pdfCount} PDF
                            </span>
                          )}
                          {driveCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 font-semibold">
                              {driveCount} Drive
                            </span>
                          )}
                          {expAlerts > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold">
                              {expAlerts} Alert
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 group-hover:underline">
                          Open &rarr;
                        </span>
                      </div>

                      {folderDocs.length > 0 && (
                        <div className="space-y-1">
                          {folderDocs.slice(0, 3).map((d) => (
                            <div
                              key={d.id}
                              className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded-lg bg-gray-50 dark:bg-zinc-800/60 text-gray-700 dark:text-zinc-300"
                            >
                              <span className="truncate font-semibold">{d.title}</span>
                              <span className="text-[10px] font-mono text-gray-400 dark:text-zinc-500 shrink-0">
                                {d.source_type === 'pdf' ? 'PDF' : 'Drive'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ========================= ADD / EDIT CUSTOM CATEGORY MODAL ========================= */}
      {isCategoryModalOpen && (
        <div
          className="fixed inset-0 !m-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setIsCategoryModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl p-4 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    {editingCategory ? 'Rename / Edit Category' : 'Create Document Category'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Organize non-vehicle documents in Supabase
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {catError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold">
                {catError}
              </div>
            )}

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Company Permits / Driver Licenses / Office Tax"
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="e.g. Annual office & company compliance documents"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-xs font-medium focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={catSaving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {catSaving ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================= DELETE CATEGORY CONFIRM MODAL ========================= */}
      {deletingCategory && (
        <div
          className="fixed inset-0 !m-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setDeletingCategory(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Delete Category</h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Remove &quot;{deletingCategory.name}&quot; and all its documents?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCategory}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Delete Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================= UPLOAD / UPDATE DOCUMENT MODAL ========================= */}
      {isDocModalOpen && (
        <div
          className="fixed inset-0 !m-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setIsDocModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full max-h-[92dvh] overflow-y-auto shadow-2xl p-4 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    {editingDoc ? 'Update Document' : 'Upload / Add Document'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Attach a Google Drive link or upload a PDF file
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDocModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {docError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold">
                {docError}
              </div>
            )}

            <form onSubmit={handleSaveDocument} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Document Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="e.g. TN 76 AK 1094 Insurance"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-xs sm:text-sm font-semibold focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Document Type
                  </label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-xs sm:text-sm font-semibold focus:outline-none focus:border-blue-600"
                  >
                    {DOC_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Source Type Toggle */}
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Upload Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDocSourceType('drive_link')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 cursor-pointer ${
                      docSourceType === 'drive_link'
                        ? 'bg-cyan-50 dark:bg-cyan-950/60 border-cyan-500 text-cyan-700 dark:text-cyan-300'
                        : 'bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300'
                    }`}
                  >
                    <Link2 className="w-4 h-4" />
                    <span>Google Drive Link</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocSourceType('pdf')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 cursor-pointer ${
                      docSourceType === 'pdf'
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                        : 'bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload PDF File</span>
                  </button>
                </div>
              </div>

              {docSourceType === 'drive_link' ? (
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Google Drive / Document URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={docDriveUrl}
                    onChange={(e) => setDocDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-xs font-mono focus:outline-none focus:border-blue-600"
                  />
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
                  <label className="text-xs font-bold text-indigo-900 dark:text-indigo-200 block">
                    Select PDF Document (Max {formatBytes(MAX_PDF_BYTES)}) *
                  </label>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handlePdfFileSelect}
                    className="block w-full text-xs text-gray-700 dark:text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
                  />
                  {docFileName && (
                    <p className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300">
                      Attached: {docFileName} ({formatBytes(docFileSize)})
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Expiry Date (Optional)
                  </label>
                  <CustomDatePicker
                    value={docExpiryDate}
                    onChange={(val) => setDocExpiryDate(val)}
                    placeholder="Select Expiry Date"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Notes / Remarks
                  </label>
                  <input
                    type="text"
                    value={docNotes}
                    onChange={(e) => setDocNotes(e.target.value)}
                    placeholder="Policy no, renewal info..."
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-xs font-medium focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsDocModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={docSaving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {docSaving ? 'Saving...' : editingDoc ? 'Update Document' : 'Save Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================= RENAME DOCUMENT MODAL ========================= */}
      {renamingDoc && (
        <div
          className="fixed inset-0 !m-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setRenamingDoc(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Rename Document</h3>
            <form onSubmit={handleConfirmRenameDoc} className="space-y-3">
              <input
                type="text"
                required
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-semibold text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-blue-600"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenamingDoc(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                >
                  Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================= MOVE DOCUMENT MODAL ========================= */}
      {movingDoc && (
        <div
          className="fixed inset-0 !m-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setMovingDoc(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Move Document</h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                Move &quot;{movingDoc.title}&quot; to another folder:
              </p>
            </div>
            <select
              value={moveTargetFolderKey}
              onChange={(e) => setMoveTargetFolderKey(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-semibold text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-blue-600"
            >
              {allFolderCards.map((c) => (
                <option key={c.folderKey} value={c.folderKey}>
                  {c.badge}: {c.title}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMovingDoc(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMoveDoc}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
              >
                Move Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================= DELETE DOCUMENT MODAL ========================= */}
      {deletingDoc && (
        <div
          className="fixed inset-0 !m-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setDeletingDoc(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Delete Document</h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Permanently delete &quot;{deletingDoc.title}&quot;?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingDoc(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDoc}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================= PDF PREVIEW MODAL ========================= */}
      {previewDoc && (
        <div
          className="fixed inset-0 !m-0 z-[80] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-5xl w-full h-[88dvh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">
                  {previewDoc.title}
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-zinc-400 font-mono truncate">
                  {previewDoc.file_name} ({formatBytes(previewDoc.file_size)})
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(previewDoc)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 dark:bg-zinc-950">
              <iframe
                src={previewDoc.file_data}
                title={previewDoc.title}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
