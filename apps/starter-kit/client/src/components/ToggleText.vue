<template>
    <div class="text-dropdown-container">
    <div @click="toggle" class="collapsible">

        <span style="font-weight: 550; padding-top: 4px;">{{header}}</span>
        <img src="../assets/icons/left-arrow.svg" :class="['arrow', { rotate: isOpen }]" />
    </div>
    <div :class="['content', { show: isOpen }]">
        <p>{{para}}</p>
    </div>
</div>
</template>

<script>
export default {
    props: {
        header: {
            type: String,
            default: '',
        },
        para: {
            type: String,
            default: '',
        },
    },
    data() {
        return {
            isOpen: false
        }
    },
    methods: {
        toggle() {
            this.isOpen = !this.isOpen
        }
    }
}
</script>

<style scoped>
.collapsible {
    display: flex;
    align-items: center;
    cursor: pointer;
    user-select: none;
}

.arrow {
    margin-left: auto;
    width: 20px;
    transform: rotate(180deg);
    transition: transform 0.3s ease;
    display: inline-block;
    margin-right: 8px;
    opacity: 80%;
}

.arrow.rotate {
    transform: rotate(270deg);
}

.content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
    padding-left: 20px;
}

.content.show {
    max-height: 200px;
}
</style>