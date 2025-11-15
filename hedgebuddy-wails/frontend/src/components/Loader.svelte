<script lang="ts">
  export let message: string = 'Loading...';
</script>

<div class="loader-container">
  <div class="spinner"></div>
  <p>{message}</p>
</div>

<style>
  .loader-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-3xl);
    gap: var(--spacing-lg);
  }
  
  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--bg-tertiary);
    border-top: 4px solid var(--accent-blue);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  p {
    color: var(--text-secondary);
    font-size: var(--text-md);
    margin: 0;
  }
</style>
