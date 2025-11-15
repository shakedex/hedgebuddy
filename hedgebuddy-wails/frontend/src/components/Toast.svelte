<script lang="ts">
  import { toast, type Toast } from '../lib/toast';
  import { fly, fade } from 'svelte/transition';
  import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-svelte';

  let toasts: Toast[] = [];
  toast.subscribe(value => toasts = value);

  function getIcon(type: string) {
    switch (type) {
      case 'success': return CheckCircle;
      case 'error': return XCircle;
      case 'warning': return AlertTriangle;
      default: return Info;
    }
  }

  function getColor(type: string) {
    switch (type) {
      case 'success': return '#4ade80';
      case 'error': return '#f87171';
      case 'warning': return '#fbbf24';
      default: return '#60a5fa';
    }
  }
</script>

<div class="toast-container">
  {#each toasts as t (t.id)}
    <div
      class="toast toast-{t.type}"
      transition:fly={{ y: 20, duration: 300 }}
    >
      <div class="toast-icon" style="color: {getColor(t.type)}">
        <svelte:component this={getIcon(t.type)} size={20} />
      </div>
      <p class="toast-message">{t.message}</p>
      <button class="toast-close" on:click={() => toast.remove(t.id)}>
        <X size={16} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 12px;
    pointer-events: none;
  }

  .toast {
    pointer-events: all;
    background: #2a2a35;
    border: 1px solid #3a3a45;
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 320px;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .toast-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toast-message {
    flex: 1;
    margin: 0;
    color: #e0e0ea;
    font-size: 14px;
    line-height: 1.4;
  }

  .toast-close {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: #8c8c96;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .toast-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #e0e0ea;
  }

  .toast-success {
    border-left: 3px solid #4ade80;
  }

  .toast-error {
    border-left: 3px solid #f87171;
  }

  .toast-warning {
    border-left: 3px solid #fbbf24;
  }

  .toast-info {
    border-left: 3px solid #60a5fa;
  }
</style>
