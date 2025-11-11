<template>
  <button class="primary-button">
    <img class="primary-button-logo" src="../assets/AlWLogo.svg" alt="altareq-white-logo" />
    <div class="primary-button-text">{{text}}</div>
    
  </button>
</template>

<script>
  export default {
    props: {
      text: {
      type: String,
      default: 'Proceed to AlTareq',
    },
    }
  }
</script>