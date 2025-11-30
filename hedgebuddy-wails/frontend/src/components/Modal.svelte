<script lang="ts">
  export let title: string;
  
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dispatch('close');
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-overlay" on:click={() => dispatch('close')} on:keydown={handleKeydown}>
  <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <h2>{title}</h2>
    <slot />
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  
  .modal {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-3xl);
    max-width: 400px;
    text-align: center;
  }
  
  .modal h2 {
    color: var(--text-primary);
    font-size: var(--text-2xl);
    margin: 0 0 var(--spacing-lg) 0;
  }
  
  .modal :global(p) {
    color: var(--text-secondary);
    font-size: var(--text-md);
    margin: 0 0 var(--spacing-2xl) 0;
  }
  
  .modal :global(strong) {
    color: var(--text-primary);
  }
  
  .modal :global(.modal-actions) {
    display: flex;
    gap: var(--spacing-lg);
    justify-content: center;
  }
</style>
