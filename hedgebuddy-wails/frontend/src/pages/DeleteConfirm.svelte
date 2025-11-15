<script lang="ts">
  import Modal from '../components/Modal.svelte';
  import Button from '../components/Button.svelte';
  
  export let varName: string;
  
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<Modal title="Delete Variable?" on:close={() => dispatch('cancel')}>
  <p>Are you sure you want to delete '<strong>{varName}</strong>'?</p>
  <div class="modal-actions">
    <Button variant="secondary" on:click={() => dispatch('cancel')}>Cancel</Button>
    <Button variant="danger" on:click={() => dispatch('confirm')}>Delete</Button>
  </div>
</Modal>
