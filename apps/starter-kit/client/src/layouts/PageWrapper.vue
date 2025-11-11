<template>
    <div class="page-container">
        <div style="z-index: 1; height: 3rem; padding: 5px; position: fixed; top: 0; left: 0; width: 100%;  background: linear-gradient(270deg, rgba(90,181,180,1) 0%, rgba(39,79,173,1) 50%, rgba(1,4,8,1) 100%);">
        </div>
        <div class="logo-container">
            <img class="altareq-logo" src="../assets/AlTareq.png" alt="AlTareq" />
        </div>
        <ProgressBar v-if="route !== 'open-product-requests' && route !== 'consent-setup'" />
        <router-view />
    </div>
</template>

<script>
import ProgressBar from '../components/ProgressBar.vue'

export default {
    components: {
        ProgressBar,
    },
    computed: {
        route() {
            return this.$route.name
        },
    }
}
</script>