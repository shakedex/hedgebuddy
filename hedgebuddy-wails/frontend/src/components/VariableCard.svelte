<script lang="ts">
  import { Pencil, Trash2 } from 'lucide-svelte';
  import Button from './Button.svelte';
  
  export let name: string;
  export let value: string;
  export let type: string;
  export let description: string;
  
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<div class="variable-card">
  <div class="card-accent"></div>
  <div class="card-content">
    <div class="var-name-section">
      <div class="var-name">{name}</div>
      {#if description}
        <div class="var-description">{description}</div>
      {/if}
    </div>
    <div class="var-type-badge">{type}</div>
    <div class="var-value-section">
      <code class="var-value">{value}</code>
    </div>
    <div class="card-actions">
      <Button variant="icon" title="Edit" on:click={() => dispatch('edit', name)}>
        <Pencil size={20} />
      </Button>
      <Button variant="icon" title="Delete" on:click={() => dispatch('delete', name)}>
        <Trash2 size={20} />
      </Button>
    </div>
  </div>
</div>

<style>
  .variable-card {
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
    display: flex;
  }
  
  .card-accent {
    width: 4px;
    background: var(--accent-blue);
    flex-shrink: 0;
  }
  
  .card-content {
    flex: 1;
    padding: var(--spacing-lg) var(--spacing-xl);
    display: flex;
    align-items: center;
    gap: var(--spacing-lg);
  }
  
  .var-name-section {
    min-width: 50px;
    flex-shrink: 0;
  }
  
  .var-name {
    font-size: var(--text-xl);
    color: var(--text-primary);
    font-weight: 600;
    margin-bottom: 2px;
  }
  
  .var-description {
    font-size: var(--text-xs);
    color: var(--text-muted);
    line-height: 1.4;
  }
  
  .var-type-badge {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    padding: 4px 10px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 500;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }
  
  .var-value-section {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
  }
  
  .var-value {
    background: #1e1e23;
    color: #e0e0ea;
    padding: 8px 12px;
    border-radius: 6px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: var(--text-sm);
    border: 1px solid #2a2a2f;
    word-break: break-all;
    white-space: pre-wrap;
    width: 100%;
    display: block;
  }
  
  .card-actions {
    display: flex;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }
  
  .card-actions :global(.btn-icon) {
    width: 44px;
    height: 44px;
  }
  
  .card-actions :global(.btn-icon:first-child) {
    background: var(--accent-blue);
    color: white;
  }
  
  .card-actions :global(.btn-icon:first-child:hover) {
    background: var(--accent-blue-hover);
  }
  
  .card-actions :global(.btn-icon:last-child) {
    background: var(--accent-red);
    color: white;
  }
  
  .card-actions :global(.btn-icon:last-child:hover) {
    background: var(--accent-red-hover);
  }
</style>
